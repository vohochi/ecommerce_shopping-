import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Product } from 'src/app/models/products';
import { ProductService } from 'src/app/services/products.service';

@Component({
  selector: 'app-detail',
  templateUrl: './detail.component.html',
  styleUrls: ['./detail.component.css'],
})
export class DetailComponent implements OnInit {
  product!: Product;
  // get từ service
  constructor(
    private route: ActivatedRoute,
    private productService: ProductService
  ) {}

  ngOnInit() {
    this.getProduct();
  }

  // lay Product
  getProduct() {
    const productId = this.route.snapshot.paramMap.get('id');
    this.productService.getProduct(productId).subscribe(
      (product) => {
        this.product = product;
      },
      (error) => {
        console.log('Error fetching product:', error);
      }
    );
  }
  getAbsoluteImageUrl(): string {
    // lấy đường dẫn tuyệt đối
    return `/assets/public/images/${this.product.imageUrl}`;
  }
}
