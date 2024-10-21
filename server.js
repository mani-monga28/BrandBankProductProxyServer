const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;  // Heroku provides its own port

app.use(cors());
app.use(express.json());  // To parse JSON bodies

const clientId = 'e4ba10c0-b540-44f3-bc7a-04f6316e15e0';
const clientSecret = '89GxNuhmt0ZQMGCzMS';  // Replace with your client secret
const shortCode = 'q0u18r0g';
const organizationId = 'f_ecom_aazi_dev';

// Caching variables
let accessTokenCache = null;
let accessTokenExpiry = null;
const productCache = {};
const productCacheTTL = 5 * 60 * 1000;  // 5 minutes TTL

function formatData(pData) {
    const imagesByColor = {};
    pData.imageGroups.forEach(group => {
        const colorCode = group.variationAttributes.find(attr => attr.id === 'color').values[0].value;

        // Map the images to the color code
        imagesByColor[colorCode] = group.images.map(image => ({
            url: 'https://www.seedheritage.com/' + new URL(image.absUrl).pathname,
            alt: image.alt.default,
            title: image.title.default
        }));
    });


    const jsonObj = {
        id: pData.id,
        ImageByColor: imagesByColor
    }
    return(imagesByColor);
}

// Function to get a new access token or use the cached one
async function getAccessToken() {
    const currentTime = new Date().getTime();

    if (accessTokenCache && accessTokenExpiry && currentTime < accessTokenExpiry) {
        return accessTokenCache;
    }

    try {
        const tokenUrl = 'https://account.demandware.com/dwsso/oauth2/access_token';
        const params = new URLSearchParams();
        params.append('grant_type', 'client_credentials');
        params.append('scope', 'SALESFORCE_COMMERCE_API:aazi_dev sfcc.products');

        const authHeader = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

        const response = await axios.post(tokenUrl, params, {
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        accessTokenCache = response.data.access_token;
        accessTokenExpiry = currentTime + (response.data.expires_in * 1000);

        return accessTokenCache;
    } catch (error) {
        throw new Error('Failed to get access token');
    }
}

// Function to get product data from the API or cache
async function getProductData(productId) {
    const currentTime = new Date().getTime();

    if (productCache[productId] && currentTime < productCache[productId].expiry) {
        return productCache[productId].data;
    }

    const accessToken = await getAccessToken();

    try {
        const productUrl = `https://${shortCode}.api.commercecloud.salesforce.com/product/products/v1/organizations/${organizationId}/products/${productId}`;

        const response = await axios.get(productUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        const formattedData = formatData(response.data);

        productCache[productId] = {
            data: formattedData,
            expiry: currentTime + productCacheTTL
        };

        return formattedData;
    } catch (error) {
        throw new Error('Failed to fetch product data');
    }
}

// Route to fetch product data
app.get('/api/product/:productId', async (req, res) => {
    const productId = req.params.productId;

    try {
        const productData = await getProductData(productId);
        res.json(productData);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Failed to fetch product data');
    }
});

// Route to fetch multiple products in parallel
app.post('/api/products', async (req, res) => {
    const { productIds } = req.body;

    if (!Array.isArray(productIds)) {
        return res.status(400).send('productIds should be an array');
    }

    try {
        // Fetch all product data simultaneously
        const productsData = await Promise.all(
            productIds.map(async (productId) => {
                try {
                    const productData = await getProductData(productId);
                    // Map product ID as key to an object containing product images
                    return { [productId]: productData }; // Adjusted structure
                } catch (error) {
                    return { [productId]: { error: 'Failed to fetch data' } }; // Return error for individual products
                }
            })
        );

        // Combine the results into a single object
        const responseObject = Object.assign({}, ...productsData);

        res.json(responseObject);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Failed to fetch product data');
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
