const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const cors = require('cors');
require('dotenv').config()
const port = process.env.PORT || 5000;

const stripe = require('stripe')(process.env.STRIPE_SECRETE);
const crypto = require('crypto');



const app = express();
app.use(cors());
app.use(express.json());

// firebase theke 
var admin = require("firebase-admin");
// const serviceAccount = require("./firebase-admin-key.json");
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);
// firebase theke pelam  
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
// verify token 
const verifyFBToken = async (req, res, next) => {
    const token = req.headers.authorization;

    if (!token) {
        return res.status(401).send({ message: 'Unauthorized Access' })
    }
    try {
        const idToken = token.split(' ')[1]
        const decoded = await admin.auth().verifyIdToken(idToken);
        // console.log("decoded Info", decoded)
        req.decoded_email = decoded.email;
        next();
    }
    catch (error) {
        return res.status(401).send({ message: 'Unauthorized Access' })
    }

}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gzvuhez.mongodb.net/?appName=Cluster0`;


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        // Send a ping to confirm a successful connection
        const database = client.db('bloodDonation');
        const userCollection = database.collection('user');
        const donationsCollection = database.collection('donationRequest');
        const paymentsCollection = database.collection('payments');

        // users related api here 
        // post method 
        app.post('/users', async (req, res) => {
            const userInfo = req.body;
            userInfo.status = "Active";
            userInfo.role = "Donor"
            userInfo.createdAt = new Date();
            const result = await userCollection.insertOne(userInfo);
            res.send(result)

        })
        // get method all users 

        app.get('/users', verifyFBToken, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.status(200).send(result);
        })

        // get method role 
        app.get('/users/role/:email', async (req, res) => {
            const email = req.params.email

            // 1st email mongodb er 2nd backend 
            const query = { email: email }
            const result = await userCollection.findOne(query)
            // console.log(result)
            res.send(result)


        })
        // update active status api here 
        app.patch('/update/user/status', verifyFBToken, async (req, res) => {
            const { email, status } = req.query;
            const query = { email: email };

            const updateStatus = {
                $set: {
                    status: status,
                }
            }
            const result = await userCollection.updateOne(query, updateStatus);
            res.send(result);

        })
        // search api here 
        app.get('/search-request', async (req, res) => {
            const { bloodGroup, district, upazila } = req.query;
            const query = {};
            if (!query) {
                return;
            }
            if (bloodGroup) {
                query.bloodGroup = bloodGroup;
            }
            if (district) {
                query.recipientDistrict = district;
            }
            if (upazila) {
                query.recipientUpazila = upazila;
            }
            const result = await donationsCollection.find(query).toArray();
            console.log(result)
            res.send(result)
        });


        // donor request api 
        //  post method
        app.post('/requests', verifyFBToken, async (req, res) => {
            const data = req.body;
            data.createdAt = new Date();
            const result = await donationsCollection.insertOne(data);
            res.send(result)
        })

        // get all request 
        app.get('/all-requests', async (req, res) => {
            const result = await donationsCollection.find().toArray();
            res.send(result)
        })
        //    get method
        app.get('/my-requests', verifyFBToken, async (req, res) => {
            const email = req.decoded_email;
            const size = Number(req.query.size);
            const page = Number(req.query.page);
            const query = { requesterEmail: email };
            const result = await donationsCollection
                .find(query)
                .limit(size)
                .skip(size * page)
                .toArray();

            const totalRequest = await donationsCollection.countDocuments(query);
            res.send({ request: result, totalRequest })

        })
        // get single data 
        app.get('/view-details/:id', async (req, res) => {
            const { id } = req.params;


            const result = await donationsCollection.findOne({ _id: new ObjectId(id) });
            res.send(result);
        });


        // payment api stripe 

        app.post('/create-payment-checkout', async (req, res) => {
            const information = req.body;
            const amount = parseInt(information.donationAmount) * 100;

            const session = await stripe.checkout.sessions.create({
                line_items: [
                    {
                        price_data: {
                            currency: 'usd',
                            unit_amount: amount,
                            product_data: {
                                name: 'Please Donate:'
                            }
                        },
                        quantity: 1,
                    },
                ],
                mode: 'payment',
                metadata: {
                    donarName: information?.donarName
                },
                customer_email: information?.donarEmail,
                success_url: `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.SITE_DOMAIN}/payment-cancelled`,

            });
            res.send({ url: session.url })
        })
        // payment success post db 
        app.post('/success-payment', async (req, res) => {
            const { session_id } = req.query;
            const session = await stripe.checkout.sessions.retrieve(
                session_id
            );
            console.log(session);
            const transactionId = session.payment_intent;
            // no duplicate 
            const isPaymentExit = await paymentsCollection.findOne({ transactionId });
            if (isPaymentExit) {
                return res.status(400).send('Already Exist')
            }

            if (session.payment_status == "paid") {
                const paymentInfo = {
                    amount: session.amount_total / 100,
                    currency: session.currency,
                    donarEmail: session.customer_email,
                    transactionId,
                    payment_status: session.payment_status,
                    paidAt: new Date(),
                }
                const result = await paymentsCollection.insertOne(paymentInfo);
                console.log(result)
                return res.send(result)
            }
        })
        // upayment get method 
        app.get('/payment-user', async (req, res) => {
            const result = await paymentsCollection.find().toArray();
            res.send(result)

        })




        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Hello Junior Developer')
})

app.listen(port, () => {
    console.log(`The server is running on port:${port}`)
})