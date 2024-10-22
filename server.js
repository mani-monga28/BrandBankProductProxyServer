const express = require('express');
const axios = require('axios');
const cors = require('cors');
const compression = require('compression');
const https = require('https');  // Import https module
require('dotenv').config();


const app = express();
const port = process.env.PORT || 3000;

app.use(compression());
app.use(cors());
app.use(express.json());

const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const shortCode = process.env.SHORT_CODE;
const organizationId = process.env.ORGANIZATION_ID;

// Caching variables
let accessTokenCache = null;
let accessTokenExpiry = null;
const productCache = {};
const productCacheTTL = 24 * 60 * 60 * 1000;  // 1 day TTL

// Create an https.Agent with keepAlive
const httpsAgent = new https.Agent({
    keepAlive: true,            // Keep connections alive
    maxSockets: 10,             // Limit concurrent sockets
    keepAliveMsecs: 3000        // Keep-alive timeout in ms
});

function formatData(pData) {
    const imagesByColor = {};
    pData.imageGroups.forEach(group => {
        const colorCode = group.variationAttributes.find(attr => attr.id === 'color').values[0].value;

        // Map the images to the color code
        imagesByColor[colorCode] = group.images.map(image => ({
            url: 'https://www.seedheritage.com' + new URL(image.absUrl).pathname,
            alt: image.alt.default,
            title: image.title.default
        }));
    });

    return imagesByColor;
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
            },
            httpsAgent   // Pass the https agent here
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
            },
            httpsAgent   // Use the https agent here as well
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
                    return { [productId]: productData };
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
