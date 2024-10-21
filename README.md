# Product Data Fetcher API

This API allows you to fetch product data from Salesforce Commerce Cloud, including product images categorized by color.

## Hosted API

You can access the hosted API at:

[https://brand-bank-proxy-server-65b11869f7ca.herokuapp.com](https://brand-bank-proxy-server-65b11869f7ca.herokuapp.com)

## API Endpoints

### 1. Get Product by ID

- **Endpoint**: `/api/product/:productId`
- **Method**: `GET`
- **Description**: Fetch data for a single product by its `productId`.

### 2. Get Multiple Products

- **Endpoint**: `/api/products`
- **Method**: `POST`
- **Description**: Fetch data for multiple products by sending an array of product IDs in the request body.
