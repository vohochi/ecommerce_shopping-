// Thư viện MongoClient giúp kết nối với MongoDB
const MongoClient = require('mongodb').MongoClient;
// URL của cơ sở dữ liệu MongoDB
const url = 'mongodb://127.0.0.1:27017';
// Tên database và collection
const dbName = 'bookshop';

const data = {
  products: [
    {
      id: 1,
      name: 'Cà Phê Đen Đá Túi (30 gói x 16g)',
      price: 110000,
      imageUrl: 'caphe1.webp',
    },
    {
      id: 2,
      name: 'Thùng Cà Phê Sữa Espresso',
      price: 336000,
      imageUrl: 'caphe2.webp',
    },
    {
      id: 3,
      name: 'Combo 6 Lon Cà Phê Sữa Espresso',
      price: 84000,
      imageUrl: 'caphe3.webp',
    },
    {
      id: 4,
      name: 'Cà Phê Rang Xay Original 1 250g',
      price: 60000,
      imageUrl: 'caphe4.webp',
    },
    {
      id: 5,
      name: 'Cà Phê Sữa Đá Hòa Tan (10 gói x 22g)',
      price: 44000,
      imageUrl: 'caphe5.jpg',
    },
    {
      id: 6,
      name: 'Cà Phê Sữa Đá Hòa Tan Túi 25x22G',
      price: 99000,
      imageUrl: 'caphe6.webp',
    },
    {
      id: 7,
      name: 'Cà Phê Hòa Tan Đậm Vị Việt (18 gói x 16 gam)',
      price: 40000,
      imageUrl: 'caphe7.webp',
    },
    {
      id: 8,
      name: 'Cà Phê Sữa Đá Pack 6 Lon',
      price: 84000,
      imageUrl: 'caphe8.webp',
    },
  ],
};

async function main() {
  const client = await MongoClient.connect(url, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  const db = client.db(dbName);

  await insertData(db, 'products_coffee', data.products);
  // await insertData(db, 'categories', data.categories);
  // await insertData(db, 'users', data.user);

  client.close();
}

async function insertData(db, collectionName, data) {
  await db.createCollection(collectionName);
  await db.collection(collectionName).insertMany(data);
}

main().catch(console.error);
