import { Component, OnInit } from '@angular/core';
import { Product } from 'src/app/models/products';
import { ProductService } from 'src/app/services/products.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css'],
})
export class HomeComponent implements OnInit {
  products: Product[] = [];
  // get từ service
  constructor(private productService: ProductService) {}

  ngOnInit() {
    this.getProducts();
  }
  // get Products
  getProducts() {
    this.productService.getProducts().subscribe(
      (products) => {
        this.products = products;
      },
      (error) => {
        console.log('Lỗi lấy sản phẩm:', error);
      }
    );
  }
}
