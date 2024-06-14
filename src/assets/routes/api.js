require('dotenv').config();

var express = require('express');
var router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const jwt = require('jsonwebtoken');

// Thiết lập nơi lưu trữ và tên file
let storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Sử dụng path.join để tạo đường dẫn tới thư mục gốc của dự án và thư mục 'public/images'
    const uploadPath = path.join(__dirname, '../public/images');
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});

// ...
//Kiểm tra file upload
function checkFileUpLoad(req, file, cb) {
  if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
    return cb(new Error('Bạn chỉ được upload file ảnh'));
  }
  cb(null, true);
}
//Upload file
let upload = multer({ storage: storage, fileFilter: checkFileUpLoad });
//Imort model
const connectDb = require('../models/db');
// Hàm kiểm tra token (middleware)
function verifyToken(req, res, next) {
  const bearerHeader = req.headers['authorization'];
  if (typeof bearerHeader !== 'undefined') {
    const bearer = bearerHeader.split(' ');
    const bearerToken = bearer[1];
    jwt.verify(bearerToken, 'lock', (err, decoded) => {
      if (err) {
        return res.status(401).json({ message: 'Token không hợp lệ' });
      } else {
        req.user = decoded;
        next();
      }
    });
  } else {
    res.status(403).send({ message: 'Không có token' });
  }
}

const conditionalVerifyAccessToken = (req, res, next) => {
  if (req.headers['authorization']) {
    // If Authorization header is present, apply verifyAccessToken middleware
    return verifyAccessToken(req, res, next);
  } else {
    // If no Authorization header, proceed to the next middleware
    return next();
  }
};
const verifyAccessToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log(authHeader);

  if (!authHeader) {
    return res.status(401).json({ message: 'Tiêu đề ủy quyền bị thiếu' });
  }

  const token = authHeader.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res
          .status(401)
          .json({ message: 'Mã thông báo truy cập hết hạn' });
      }
      return res
        .status(403)
        .json({ message: 'Mã thông báo truy cập không hợp lệ' });
    }

    req.userId = decoded.userId;
    next();
  });
};

const verifyRefreshToken = async (req, res, next) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    res.status(403).json({ message: 'Refresh token is invalid' });
  }
};
//checkout
router.get('/products/billCheckout', async (req, res) => {
  const db = await connectDb();
  const collection = db.collection('checkout');

  try {
    // Truy vấn tất cả hóa đơn từ cơ sở dữ liệu
    const bills = await collection.find({}).toArray();

    // Gửi dữ liệu hóa đơn trở lại cho client
    res.status(200).json(bills);
  } catch (error) {
    // Xử lý trường hợp có lỗi xảy ra
    res
      .status(500)
      .json({ message: 'Lỗi khi lấy dữ liệu hóa đơn.', error: error });
  }
});
router.post('/products/billCheckout', async (req, res) => {
  const {
    name,
    email,
    district,
    phone,
    address,
    village,
    zip,
    bank,
    data,
    ship,
    note,
    totalPrice,
  } = req.body;

  // Kết nối đến cơ sở dữ liệu
  const db = await connectDb();
  const usersCollection = db.collection('users');
  const checkoutCollection = db.collection('checkout');

  try {
    // Tìm thông tin người dùng từ email
    const user = await usersCollection.findOne({ email: email });
    if (!user) {
      return res
        .status(404)
        .json({ message: 'Không tìm thấy người dùng với email này.' });
    }
    const userId = user._id;

    // Định nghĩa các giá trị mặc định
    const defaultValues = {
      userId, // Trường liên kết đến người dùng
      orderStatus: 'processing',
      paymentStatus: 'pending',
      createdAt: new Date(),
    };

    // Chèn thông tin thanh toán vào bảng 'checkout'
    const result = await checkoutCollection.insertOne({
      ...defaultValues,
      name,
      email,
      district,
      phone,
      address,
      village,
      zip,
      bank,
      data,
      ship,
      note,
      totalPrice,
    });

    res.status(201).json({
      message: 'Thông tin thanh toán đã được lưu thành công.',
      result: result,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Lỗi khi lưu thông tin thanh toán.', error: error });
  }
});
const { ObjectId } = require('mongodb');

// confirmCheckout
router.patch('/products/confirmCheckout/:billId', async (req, res) => {
  const billId = req.params.billId; // Lấy ID hóa đơn từ URL
  // Kết nối đến cơ sở dữ liệu
  const db = await connectDb();
  const checkoutCollection = db.collection('checkout');

  try {
    // Cập nhật trạng thái của hóa đơn
    const result = await checkoutCollection.updateOne(
      { _id: new ObjectId(billId) },
      {
        $set: {
          paymentStatus: 'fulfilled',
          orderStatus: 'Đã thanh toán',
          confirmedAt: new Date(),
        },
      }
    );

    if (result.modifiedCount === 0) {
      return res
        .status(404)
        .json({ message: 'Không tìm thấy hóa đơn để cập nhật.' });
    }

    // Trả về phản hồi thành công
    res.status(200).json({
      message: 'Hóa đơn đã được xác nhận thành công.',
      result: result,
    });
  } catch (error) {
    // Xử lý lỗi nếu có
    res
      .status(500)
      .json({ message: 'Lỗi khi xác nhận hóa đơn.', error: error });
  }
});

// Lấy thông tin chi tiết của hóa đơn theo ID

router.get('/products/confirmCheckout/:billId', async (req, res) => {
  let db, checkoutCollection;
  try {
    const billId = req.params.billId;
    db = await connectDb();
    checkoutCollection = db.collection('checkout');

    if (!ObjectId.isValid(billId)) {
      return res.status(400).json({ message: 'ID hóa đơn không hợp lệ.' });
    }

    const bill = await checkoutCollection.findOne({
      _id: new ObjectId(billId),
    });

    if (!bill) {
      return res
        .status(404)
        .json({ message: 'Không tìm thấy hóa đơn với ID này.' });
    }

    res.status(200).json(bill);
  } catch (error) {
    console.error('Lỗi khi lấy thông tin hóa đơn:', error);
    res.status(500).json({
      message: 'Lỗi khi lấy thông tin hóa đơn.',
      error: error.toString(),
    });
  }
});

// check token
router.post('/token/verify', (req, res) => {
  const { token } = req.body;

  // Kiểm tra xem token có được cung cấp hay không
  if (!token) {
    return res.status(400).json({
      success: false,
      message: 'Không có mã thông báo được cung cấp.',
    });
  }

  try {
    // Sử dụng cùng 'secret key' mà bạn đã sử dụng để tạo token
    const decoded = jwt.verify(token, 'lock');
    // Token hợp lệ và còn thời hạn
    res.json({
      success: true,
      message: 'Token is valid.',
      decoded,
    });
  } catch (error) {
    // Token không hợp lệ hoặc đã hết hạn
    res
      .status(401)
      .json({ success: false, message: 'Token is invalid or expired.' });
  }
});
// Phân trang
router.get('/products/paginations/:page', async (req, res, next) => {
  try {
    const db = await connectDb();
    const productCollection = db.collection('products');

    // Lấy giá trị page từ params
    const page = parseInt(req.params.page, 10) || 1;

    // Lấy số lượng dữ liệu mỗi trang
    const pageSize = 16;

    // Lấy tổng số lượng dữ liệu
    const totalData = await productCollection.countDocuments();

    // Tính số lượng trang
    const totalPages = Math.ceil(totalData / pageSize);

    // Lấy dữ liệu theo trang
    const data = await productCollection
      .find({})
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray();

    res.json({
      data: data, // Đối tượng dữ liệu chính
      pagination: {
        page,
        pageSize,
        totalData,
        totalPages,
      },
    });
  } catch (error) {
    // Xử lý lỗi và gửi thông báo lỗi trở lại cho client
    res
      .status(500)
      .json({ message: 'Internal Server Error', error: error.message });
  }
});

//Lấy danh sách sản phẩm và sắp xếp theo tăng dần về giá và giới hạn số lượngư
router.get('/products/increaseProducts', async (req, res, next) => {
  const db = await connectDb();
  const productCollection = db.collection('products');

  try {
    const products = await productCollection
      .find() // Lấy tất cả sản phẩm
      .sort({ price: 1 })
      .limit(5) // Sắp xếp theo price tăng dần
      .toArray();

    if (products) {
      res.status(200).json(products);
    } else {
      res.status(404).json({ message: 'Không tìm thấy sản phẩm nào' });
    }
  } catch (error) {
    res.status(500).send('Lỗi hệ thống');
  }
});

// sap xep giam dan
router.get('/products/decreaseProducts', async (req, res, next) => {
  const db = await connectDb();
  const productCollection = db.collection('products');

  try {
    const products = await productCollection
      .find() // Lấy tất cả sản phẩm
      .sort({ price: -1 })
      .limit(5) // Sắp xếp theo price tăng dần
      .toArray();

    if (products) {
      res.status(200).json(products);
    } else {
      res.status(404).json({ message: 'Không tìm thấy sản phẩm nào' });
    }
  } catch (error) {
    res.status(500).send('Lỗi hệ thống');
  }
});

//Trả về json danh sách sản phẩm

router.get(
  '/products',
  conditionalVerifyAccessToken,
  async (req, res, next) => {
    const db = await connectDb();
    const productCollection = db.collection('products');
    const products = await productCollection.find().toArray();

    if (products) {
      res.status(200).json(products);
    } else {
      res.status(404).json({ message: 'Không tìm thấy' });
    }
  }
);
router.get(
  '/products_coffee',
  conditionalVerifyAccessToken,
  async (req, res, next) => {
    const db = await connectDb();
    const productCollection = db.collection('products_coffee');
    const products = await productCollection.find().toArray();

    if (products) {
      res.status(200).json(products);
    } else {
      res.status(404).json({ message: 'Không tìm thấy' });
    }
  }
);

router.get('/products_coffee/:id', async (req, res, next) => {
  try {
    const db = await connectDb();
    const productCollection = db.collection('products_coffee');
    const id = req.params.id;

    const product = await productCollection.findOne({ id: parseInt(id) });
    if (product) {
      res.status(200).json(product);
    } else {
      res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
    }
  } catch (error) {
    next(error);
  }
});

router.get('/products/hot', async (req, res, next) => {
  const db = await connectDb();

  const productCollection = db.collection('products');

  try {
    const products = await productCollection.find({ hot: true }).toArray();

    if (products) {
      res.status(200).json(products);
    } else {
      res.status(404).json({ message: 'Không tìm thấy sản phẩm nào' });
    }
  } catch (error) {
    res.status(500).send('Lỗi hệ thống');
  }
});
router.get('/products/trending', async (req, res, next) => {
  const db = await connectDb();

  const productCollection = db.collection('products');

  try {
    const products = await productCollection.find({ trending: true }).toArray();

    if (products) {
      res.status(200).json(products);
    } else {
      res.status(404).json({ message: 'Không tìm thấy sản phẩm nào' });
    }
  } catch (error) {
    res.status(500).send('Lỗi hệ thống');
  }
});
router.get('/products/topRate', async (req, res, next) => {
  const db = await connectDb();

  const productCollection = db.collection('products');

  try {
    const products = await productCollection.find({ topRate: true }).toArray();

    if (products) {
      res.status(200).json(products);
    } else {
      res.status(404).json({ message: 'Không tìm thấy sản phẩm nào' });
    }
  } catch (error) {
    res.status(500).send('Lỗi hệ thống');
  }
});

//Trả về json sản phẩm theo id

router.get('/product/:id', async (req, res, next) => {
  try {
    const db = await connectDb();
    const productCollection = db.collection('products');
    let id = req.params.id;
    const product = await productCollection.findOne({ _id: new ObjectId(id) }); // Use
    if (product) {
      res.status(200).json(product);
    } else {
      res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
    }
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'ID không hợp lệ' });
    }
    next(error);
  }
});

//Post thêm sản phẩm
router.post('/products', upload.single('img'), async (req, res, next) => {
  let { name, price, categoryId, description } = req.body;
  let img = req.file.originalname;
  const db = await connectDb();
  const productCollection = db.collection('products');
  let lastProduct = await productCollection
    .find()
    .sort({ id: -1 })
    .limit(1)
    .toArray();
  let id = lastProduct[0] ? lastProduct[0].id + 1 : 1;
  let newProduct = { id, name, price, categoryId, img, description };
  await productCollection.insertOne(newProduct);
  if (newProduct) {
    res.status(200).json(newProduct);
  } else {
    res.status(404).json({ message: 'Not found' });
  }
});

//Put sửa sản phẩm từ form

router.put('/product/:id', upload.single('image'), async (req, res, next) => {
  try {
    let id = req.params.id;
    const db = await connectDb();
    const productsCollection = db.collection('products');
    let { name, price, categoryId, description } = req.body;

    var image;
    if (req.file) {
      image = req.file.originalname;
    } else {
      // Lấy sản phẩm từ _id để lấy image cũ
      let product = await productsCollection.findOne({ _id: new ObjectId(id) });
      if (!product) {
        return res.status(404).json({ message: 'Sản phẩm không tồn tại.' });
      }
      image = product.image;
    }

    let editProduct = { name, price, categoryId, image, description };
    let updateResult = await productsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: editProduct }
    );

    if (updateResult.matchedCount === 0) {
      res.status(404).json({ message: 'Sản phẩm không tồn tại.' });
    } else if (updateResult.modifiedCount === 0) {
      res.status(304).json({ message: 'Sản phẩm không được cập nhật.' });
    } else {
      res.status(200).json(editProduct);
    }
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ message: 'ID không hợp lệ.' });
    }
    next(error);
  }
});

//Xóa sản phẩm
router.delete('/product/:id', async (req, res, next) => {
  let id = req.params.id;
  const db = await connectDb();
  const productsCollection = db.collection('products');

  try {
    // Sử dụng new ObjectId() để tạo một instance của ObjectId
    let product = await productsCollection.deleteOne({ _id: new ObjectId(id) });

    // Kiểm tra kết quả của việc xóa
    if (product.deletedCount > 0) {
      // Nếu có ít nhất 1 document được xóa
      res.status(200).json({ message: 'Xóa thành công.' });
    } else {
      res.status(404).json({ message: 'Không tìm thấy sản phẩm để xóa.' });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Lỗi khi xóa sản phẩm.' });
  }
});

//---------------------------Categories--------------------------------//

//Trả về json danh sách danh mục
router.get('/categories', async (req, res, next) => {
  const db = await connectDb();
  const productCollection = db.collection('categories');
  const categories = await productCollection.find().toArray();
  if (categories) {
    res.status(200).json(categories);
  } else {
    res.status(404).json({ message: 'Not found' });
  }
});

//Trả về json danh mục theo id
router.get('/categories/:id', async (req, res, next) => {
  try {
    const db = await connectDb();
    const categoriesCollection = db.collection('categories');
    let id = req.params.id;

    // Convert the string ID to an ObjectId
    if (!ObjectId.isValid(id)) {
      return res.status(404).json({ message: 'Invalid ID format' });
    }
    const objectId = new ObjectId(id);

    const category = await categoriesCollection.findOne({ _id: objectId });

    if (category) {
      res.status(200).json(category);
    } else {
      res.status(404).json({ message: 'Category not found' });
    }
  } catch (error) {
    // Handle any other errors that might occur
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

//Post thêm danh mục
router.post('/categories', upload.single('img'), async (req, res, next) => {
  let { name, quantity, category } = req.body;
  // let img = req.file.originalname;
  const db = await connectDb();
  const categoriesCollection = db.collection('categories');
  let lastCategory = await categoriesCollection
    .find()
    .sort({ id: -1 })
    .limit(1)
    .toArray();
  let id = lastCategory[0] ? lastCategory[0].id + 1 : 1;
  let newCategories = { id, name, quantity, category };
  await categoriesCollection.insertOne(newCategories);
  if (newCategories) {
    res.status(200).json(newCategories);
  } else {
    res.status(404).json({ message: 'Not found' });
  }
});

// //Put sửa danh mục từ form

router.put('/categories/:id', async (req, res, next) => {
  try {
    let id = req.params.id;
    const db = await connectDb();
    const categoriesCollection = db.collection('categories');

    // Convert the id from the URL parameter to an ObjectId
    const objectId = new ObjectId(id);

    let { name } = req.body; // Assuming you're only updating the name and optionally the image
    let image;

    if (req.file) {
      image = req.file.originalname; // Use the new image if provided
    } else {
      // Fetch the current category to retain the existing image if a new one isn't provided
      const currentCategory = await categoriesCollection.findOne({
        _id: objectId,
      });
      if (currentCategory && currentCategory.image) {
        image = currentCategory.image; // Keep the existing image if no new one is provided
      }
    }

    let editCategories = { name, image };

    const updateResult = await categoriesCollection.updateOne(
      { _id: objectId }, // Use _id for consistency
      { $set: editCategories }
    );

    // Check if the update operation was successful
    if (updateResult.matchedCount === 0) {
      res.status(404).json({ message: 'Category not found.' });
    } else if (updateResult.modifiedCount === 0) {
      res.status(400).json({ message: 'No changes made to the category.' });
    } else {
      res.status(200).json(editCategories);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

//Xóa sản phẩm
router.delete('/categories/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const db = await connectDb();
    const categoriesCollection = db.collection('categories');

    // Sử dụng ObjectId để chuyển đổi id từ String thành ObjectId
    const result = await categoriesCollection.deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 1) {
      res.status(200).json({ message: 'Xóa thành công.' });
    } else {
      res.status(404).json({ message: 'Không tìm thấy category để xóa.' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Có lỗi xảy ra khi xóa category.' });
  }
});

//---------------------------Users--------------------------------//

//Trả về json danh sách danh mục
router.get('/users', async (req, res, next) => {
  const db = await connectDb();
  const userCollection = db.collection('users');
  const users = await userCollection.find().toArray();
  if (users) {
    res.status(200).json(users);
  } else {
    res.status(404).json({ message: 'Not found' });
  }
});
// Get profile
router.get('/users/profile', verifyToken, async (req, res) => {
  try {
    // Giả sử chúng ta sử dụng JWT để xác thực
    const token = req.headers.authorization.split(' ')[1];
    const decoded = jwt.verify(token, 'lock');

    // decoded.userId là ID của người dùng được mã hoá trong token
    const db = await connectDb();
    const userCollection = db.collection('users');
    console.log(decoded);
    // Tìm kiếm người dùng dựa trên userId
    const userProfile = await userCollection.findOne({
      username: decoded.username,
    });
    console.log(userProfile);
    if (!userProfile) {
      return res.status(404).send('Không tìm thấy profile người dùng');
    }

    // Trả về profile người dùng
    res.json(userProfile);
  } catch (error) {
    // Xử lý lỗi nếu có
    res.status(500).send('Có lỗi xảy ra');
  }
});
// Post profile
router.post('/users/profile', verifyToken, async (req, res) => {
  try {
    const token = req.headers.authorization.split(' ')[1]; // Sửa lại ở đây
    const decoded = jwt.verify(token, 'lock');
    const db = await connectDb();
    const profileUserCollection = db.collection('profilesUser');
    const { fullName, email, phone, date, address, bank } = req.body;
    const updateResult = await profileUserCollection.updateOne(
      {
        username: decoded.username,
      },
      {
        $set: {
          fullName,
          email,
          phone,
          date,
          address,
          bank,
        },
      },
      { upsert: true }
    );
    if (updateResult.matchedCount === 0) {
      // Sửa lỗi đánh máy ở đây
      return res
        .status(404)
        .send('Không tìm thấy profile người dùng để cập nhật');
    }
    res.json({ message: 'Hô sơ được cập nhật thành công', updateResult }); // Sửa lỗi đánh máy ở đây
  } catch (error) {
    res.status(500).send('Có lỗi xảy ra trong quá trình cập nhật profile');
  }
});

//Trả về json danh mục theo id
router.get('/users/:id', async (req, res, next) => {
  const db = await connectDb();
  const usersCollection = db.collection('users');
  let id = req.params.id;
  const users = await usersCollection.findOne({ id: parseInt(id) });
  if (users) {
    res.status(200).json(users);
  } else {
    res.status(404).json({ message: 'Not found' });
  }
});

//Post thêm danh mục
router.post('/users', upload.single('img'), async (req, res, next) => {
  let { username, password, repassword, email, role } = req.body;
  let img = req.file.originalname;
  const db = await connectDb();
  const usersCollection = db.collection('users');
  let lastUser = await usersCollection
    .find()
    .sort({ id: -1 })
    .limit(1)
    .toArray();
  let id = lastUser[0] ? lastUser[0].id + 1 : 1;
  let newUser = {
    id,
    username,
    password,
    email,
    img,
    isAdmin: role === 'admin',
  };
  await usersCollection.insertOne(newUser);
  if (newUser) {
    res.status(200).json(newUser);
  } else {
    res.status(404).json({ message: 'Not found' });
  }
});

//Put sửa danh mục từ form
router.put('/users/:id', upload.single('img'), async (req, res, next) => {
  let id = req.params.id;
  const db = await connectDb();
  const usersCollection = db.collection('users');
  let { username, password, email } = req.body;
  if (req.file) {
    var img = req.file.originalname;
  } else {
    //láy danh mục tư id để lấy img cũ
    let users = await usersCollection.findOne({ id: parseInt(id) });
    var img = users.img;
  }
  let editUsers = { username, password, email, img };
  users = await usersCollection.updateOne(
    { id: parseInt(id) },
    { $set: editUsers }
  );
  if (users) {
    res.status(200).json(editUsers);
  } else {
    res.status(404).json({ message: 'Sửa không thành kông.' });
  }
});

//Xóa người dùng
router.delete('/users/:id', async (req, res, next) => {
  let id = req.params.id;
  const db = await connectDb();
  const usersCollection = db.collection('users');
  let user = await usersCollection.deleteOne({ id: parseInt(id) });
  if (user) {
    res.status(200).json({ message: 'Xoa thanhkong.' });
  } else {
    res.status(404).json({ message: 'Xoa khong thanhkong.' });
  }
});

// lay san pham theo ma danh muc
router.get('/products/category_id/:id', async (req, res, next) => {
  let category_id = parseInt(req.params.id);
  const db = await connectDb();
  const productCollection = db.collection('products');
  const products = await productCollection
    .find({ category_id: category_id })
    .toArray();
  console.log(products);
  if (products) {
    res.status(200).json(products);
  } else {
    res.status(404).json({ message: 'Not found' });
  }
});

// show san pham theo danh muc
router.get('/products/categoryName/:danhmuc', async (req, res, next) => {
  const id = req.params.danhmuc;
  const db = await connectDb();
  const productCollection = db.collection('products');
  const categoryCollection = db.collection('categories');

  try {
    let category = await categoryCollection.findOne({ id: +id });
    let catid = category.id;
    const products = await productCollection
      .find({ category_id: catid })
      .toArray();

    if (products.length > 0) {
      res.status(200).json(products);
    } else {
      res.status(404).json({ message: 'Không tìm thấy sản phẩm nào' });
    }
  } catch (error) {
    res.status(500).send('Lỗi hệ thống');
  }
});
// tim kiem san pham
// ...other routes...

router.get('/products/search/:searchQuery', async (req, res, next) => {
  const { searchQuery } = req.params;
  const db = await connectDb();
  const productCollection = db.collection('products');
  const categoryCollection = db.collection('categories');

  try {
    // Tìm kiếm theo tên sản phẩm (không phân biệt trường hợp)
    const nameRegex = new RegExp(searchQuery, 'i');

    // Tìm kiếm theo tên danh mục (không phân biệt trường hợp)
    const category = await categoryCollection.findOne({ name: nameRegex });

    let products;
    if (category) {
      // Tìm kiếm theo danh mục ID nếu tìm thấy danh mục phù hợp
      products = await productCollection
        .find({ category_id: category.id })
        .toArray();
    } else {
      // Tìm kiếm trực tiếp theo tên sản phẩm
      products = await productCollection.find({ name: nameRegex }).toArray();
    }

    res.status(200).json(products);
  } catch (error) {
    res.status(500).send('Server error');
  }
});
router.get('/products/price/:option', async (req, res, next) => {
  const { option } = req.params;
  const db = await connectDb();
  const productCollection = db.collection('products');

  let priceQuery = {};

  switch (option) {
    case '1':
      priceQuery = { price_sale: { $lt: 250000 } };
      break;
    case '2':
      priceQuery = { price_sale: { $gte: 250000, $lte: 400000 } };
      break;
    case '3':
      priceQuery = { price_sale: { $gt: 400000 } };
      break;
    default:
      return res.status(400).send('Tùy chọn phạm vi giá không hợp lệ');
  }

  try {
    const products = await productCollection.find(priceQuery).toArray();
    res.status(200).json(products);
  } catch (error) {
    res.status(500).send('Server error');
  }
});
// register
router.post(
  '/users/register',
  upload.single('image'),
  async (req, res, next) => {
    let { email, password, password2, username } = req.body;
    let image = req.file ? req.file.originalname : null;

    if (password !== password2) {
      return res.status(400).send('Mật khẩu không phù hợp');
    }

    const db = await connectDb();
    const userCollection = db.collection('users');

    const existingUser = await userCollection.findOne({ email });
    if (existingUser) {
      return res.status(400).send('Người dùng đã tồn tại');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    let lastUser = await userCollection
      .find()
      .sort({ id: -1 })
      .limit(1)
      .toArray();

    let id = lastUser[0] ? lastUser[0].id + 1 : 1;

    const newUser = {
      id,
      email,
      password: hashedPassword,
      username,
      image,
    };
    await userCollection.insertOne(newUser);

    // Return success message with the new user's info (excluding the password)
    delete newUser.password; // Remove the hashed password field
    return res.status(201).json({
      message: 'Người dùng đã được tạo thành công',
      user: newUser,
    });
  }
);
// login

// Route để đăng nhập
router.post('/users/login', async (req, res, next) => {
  const { email, password } = req.body;

  try {
    const db = await connectDb();
    const userCollection = db.collection('users');
    const user = await userCollection.findOne({ email });

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: 'Invalid email or password' });
    }

    if (user.isLocked) {
      return res.status(403).json({
        success: false,
        message:
          'Tài khoản của bạn bị khóa. Vui lòng liên hệ với một quản trị viên.',
      });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: 'Tên đăng nhập hoặc tài khoản của bạn không chính xác',
      });
    }

    // Tạo access token
    const accessToken = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: '5m' }
    );

    // Tạo refresh token
    const refreshToken = jwt.sign(
      { userId: user._id },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: '7d' }
    );

    // Lưu refresh token mới vào mảng refreshTokens của người dùng
    await userCollection.updateOne(
      { _id: user._id },
      { $push: { refreshTokens: refreshToken } }
    );

    // Lưu refresh token vào cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true, // Luôn sử dụng HTTPS
      sameSite: 'Strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 ngày
    });

    // Xác thực thành công
    res.json({
      success: true,
      accessToken, // Gửi access token
      user: {
        username: user.username,
        image: user.image,
        email: user.email,
      },
    });
  } catch (error) {
    // Xử lý lỗi không mong muốn
    res.status(500).json({ success: false, message: 'Đã xảy ra lỗi' });
  }
});

router.post('/users/refresh-token', async (req, res) => {
  const refreshToken = req.cookies['refreshToken'];

  if (!refreshToken) {
    return res
      .status(400)
      .json({ success: false, message: 'Không tìm thấy refreshToken' });
  }

  try {
    const db = await connectDb();
    const userCollection = db.collection('users');

    jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET,
      async (err, decoded) => {
        if (err) {
          return res
            .status(401)
            .json({ success: false, message: 'RefreshToken không hợp lệ' });
        }

        const userId = decoded.userId;
        const user = await userCollection.findOne({ _id: userId });

        if (!user.refreshTokens.includes(refreshToken)) {
          return res
            .status(403)
            .json({ success: false, message: 'RefreshToken không hợp lệ' });
        }

        // Xóa refresh token cũ khỏi mảng refreshTokens
        await userCollection.updateOne(
          { _id: userId },
          { $pull: { refreshTokens: refreshToken } }
        );

        // Tạo access token mới
        const newAccessToken = jwt.sign(
          { userId },
          process.env.ACCESS_TOKEN_SECRET,
          { expiresIn: '30m' }
        );

        // Tạo refresh token mới
        const newRefreshToken = jwt.sign(
          { userId },
          process.env.REFRESH_TOKEN_SECRET,
          { expiresIn: '7d' }
        );

        // Lưu refresh token mới vào mảng refreshTokens
        await userCollection.updateOne(
          { _id: userId },
          { $push: { refreshTokens: newRefreshToken } }
        );

        // Lưu refresh token mới vào cookie
        res.cookie('refreshToken', newRefreshToken, {
          httpOnly: true,
          secure: true, // Luôn sử dụng HTTPS
          sameSite: 'Strict',
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 ngày
        });

        res.status(200).json({ success: true, accessToken: newAccessToken });
      }
    );
  } catch (error) {
    // Xử lý lỗi không mong muốn
    res.status(500).json({ success: false, message: 'Đã xảy ra lỗi' });
  }
});

// Route để refresh access token
router.post('/refresh', verifyRefreshToken, async (req, res) => {
  try {
    const db = await connectDb();
    const userCollection = db.collection('users');
    const user = await userCollection.findOne({ _id: req.userId });

    if (!user) {
      return res.status(403).json({ message: 'Invalid refresh token' });
    }

    const accessToken = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: '15m' }
    );

    res.json({ accessToken });
  } catch (err) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Route này yêu cầu token để truy cập
router.get('/user/profile', verifyToken, (req, res) => {
  // Lấy thông tin người dùng từ cơ sở dữ liệu
  User.findById(req.user.userId, (err, user) => {
    if (err) throw err;
    res.json({
      username: user.username,
      img: user.img,
    });
  });
});
// Nhập chức năng SendMail
const { sendMail } = require('../utils/mailers');

// Bên trong tuyến đường quên của bạn
router.post('/users/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const db = await connectDb();
    const userCollection = db.collection('users');
    const user = await userCollection.findOne({ email });
    if (!user) {
      return res.send(
        'Nếu một tài khoản có email đó tồn tại, một liên kết đặt lại đã được gửi.'
      );
    }

    const resetToken = crypto.randomBytes(20).toString('hex');
    const resetTokenExpiration = Date.now() + 3600000;

    await userCollection.updateOne(
      { _id: user._id },
      { $set: { resetToken, resetTokenExpiration } }
    );

    const resetLink = `https://mail.google.com/mail/u/2/#inbox`;

    const htmlContent = `
    <p>  ${new Date().toLocaleString()} </p>
      <p>Bạn đã yêu cầu đặt lại mật khẩu.</p>
      <p>Nhấp vào liên kết này để đặt lại mật khẩu của bạn:</p>
      <a href="http://localhost:4200/reset-password?token=${resetToken}">Đặt lại mật khẩu</a>
      `;
    const htmlContent1 = `
      <p>Bạn đã yêu cầu đặt lại mật khẩu.</p>
      <p> Vui lòng kiểm tra email của bạn để đặt lại mật khẩu của bạn.</p>
      <a href="${resetLink}">Kiểm tra email</a>
    `;
    // Sử dụng chức năng SendMail
    await sendMail(user.email, 'Password Reset', htmlContent);
    // res.send(
    //   `<html><body>
    //   ${htmlContent1}
    //         <a href="${resetLink}"></a>

    //   </body></html>`
    // );
    res.status(200).json('Gửi token');
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      return res.status(503).send('Database connection error.');
    } else {
      return res.status(500).send('Server error');
    }
  }
});

router.get('/users/reset-password/?token=resetToken', async (req, res) => {
  try {
    const db = await connectDb();
    const userCollection = db.collection('users');
    const user = await userCollection.findOne({
      resetTokenExpiration: { $gt: Date.now() },
    });
    if (!user) {
      return res.status(400).send('Token không hợp lệ hoặc đã hết hạn.');
    }
  } catch (err) {
    return res.status(500).send('Server error');
  }
});
router.post('/users/reset-password/:token', async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  const db = await connectDb();
  const userCollection = db.collection('users');
  const user = await userCollection.findOne({
    resetToken: token,
    resetTokenExpiration: { $gt: Date.now() },
  });

  if (!user) {
    return res.send('Token không hợp lệ hoặc đã hết hạn.');
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newPasssword = await userCollection.updateOne(
    { _id: user._id },
    {
      $set: {
        password: hashedPassword,
        resetToken: undefined,
        resetTokenExpiration: undefined,
      },
    }
  );
  res.status(200).json(newPasssword);
});

//Post thêm sản phẩm
router.post('/products/add', upload.single('image'), async (req, res) => {
  try {
    // Destructure and obtain product details from the request body
    let { name, price, category, quantity, description, size } = req.body;

    // Get the image file name if an image was uploaded, otherwise set to null
    let image = req.file ? req.file.originalname : null;
    console.log(image);
    // Connect to the database
    const db = await connectDb();
    const productCollection = db.collection('products');

    // Tìm sản phẩm có ID cao nhất
    const lastProduct = await productCollection.findOne(
      {},
      { sort: { id: -1 } }
    );

    // Calculate the new product's id
    let id = lastProduct ? lastProduct.id + 1 : 1;

    // Construct the new product object
    let newProduct = {
      id,
      name,
      price,
      category,
      quantity,
      image,
      description,
      size,
    };

    // Insert the new product into the collection
    await productCollection.insertOne(newProduct);

    // Send a success response
    res.status(201).json({ message: 'Product added successfully', newProduct });
  } catch (error) {
    // Handle any errors that occur during the operation
    console.error('Error adding product:', error);
    res.status(500).json({ message: 'Error adding product', error });
  }
});
// cập nhật sản phẩm
router.put('/products/update/:id', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params; // Lấy ID từ parameters
    let { name, price, category, quantity, description, size } = req.body;

    // Get the image file name if an image was uploaded
    let image = req.file ? req.file.filename : null; // Sử dụng filename thay vì originalname để lưu tên file được lưu trên server

    // Connect to the database
    const db = await connectDb();
    const productCollection = db.collection('products');

    // Construct the update object
    let updateObject = {
      quantity,
      name,
      price,
      category,
      description,
      size,
      image,
    };

    console.log(image);
    // Update the product in the collection
    const result = await productCollection.updateOne(
      { id: parseInt(id) }, // ensure that the id is an integer if it's stored as such
      { $set: updateObject }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Send a success response
    res.status(200).json({ message: 'Sản phẩm cập nhật thành công' });
  } catch (error) {
    // Handle any errors that occur during the operation
    console.error('Error updating product:', error);
    res.status(500).json({ message: 'Error updating product', error });
  }
});
// show categories
router.get('/categories', async (req, res, next) => {
  const db = await connectDb();
  const categoryCollection = db.collection('categories');
  const categories = await categoryCollection.find().toArray();
});
// add category
router.post(
  '/categories/add',
  upload.single('image'),
  async (req, res, next) => {
    try {
      let { name, category, quantity } = req.body;
      let image = req.file ? req.file.originalname : null;
      const db = await connectDb();
      const categoryCollection = db.collection('categories');

      let lastCategories = await categoryCollection
        .find()
        .sort({ id: -1 })
        .limit(1)
        .toArray();

      let id = lastCategories.length > 0 ? lastCategories[0].id + 1 : 1;
      let newCategories = {
        id,
        name,
        image,
        category,
        quantity: parseInt(quantity),
      };

      await categoryCollection.insertOne(newCategories);

      // Gửi phản hồi thành công
      res
        .status(201)
        .json({ message: 'Category added successfully', newCategories });
    } catch (error) {
      // Gửi lỗi nếu có
      res.status(500).json({ message: 'Error adding category', error: error });
    }
  }
);
// Sửa lại đường dẫn route để bao gồm `:id` như một route parameter
router.put(
  '/categories/update/:id',
  upload.single('image'),
  async (req, res, next) => {
    try {
      let image = req.file ? req.file.originalname : null;
      const { id } = req.params;
      let { name, category, quantity } = req.body;
      console.log(image);
      const db = await connectDb();
      const categoryCollection = db.collection('categories');

      // Xử lý file ảnh nếu có
      const updateFields = {
        name,
        category,
        quantity,
        ...(image && { image: image }),
      };
      console.log(updateFields);
      console.log(id, 'đây là id');
      const updateResult = await categoryCollection.updateOne(
        { id: parseInt(id) },
        { $set: updateFields }
      );

      if (updateResult.matchedCount === 0) {
        return res
          .status(404)
          .json({ message: 'Không tìm thấy danh mục để cập nhật.' });
      }

      if (updateResult.modifiedCount === 0) {
        return res
          .status(304)
          .json({ message: 'Không có thông tin nào được cập nhật.' });
      }

      res.status(200).json({ message: 'Thể loại được cập nhật thành công.' });
    } catch (error) {
      res.status(500).json({
        message: 'Có lỗi xảy ra khi cập nhật danh mục.',
        error: error.message,
      });
    }
  }
);
// khóa users
router.get('/users/lock/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const db = await connectDb();
  const userCollection = db.collection('users');

  await userCollection.updateOne({ id }, { $set: { isLocked: true } });
  // res.redirect('/users');
});
// checkout
router.get('/users/unlock/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const db = await connectDb();
  const userCollection = db.collection('users');

  await userCollection.updateOne({ id }, { $set: { isLocked: false } });
});

module.exports = router;
