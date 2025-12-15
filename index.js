const { MongoClient, ServerApiVersion } = require('mongodb');
const express = require('express');
const cors = require('cors');
require('dotenv').config()
const port = process.env.PORT || 5000;


// J0Y2udRo6CEtwF4S

const app = express();
app.use(express.json());
app.use(cors());



const uri = "mongodb+srv://blooddonation:J0Y2udRo6CEtwF4S@cluster0.gzvuhez.mongodb.net/?appName=Cluster0";

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

        app.post('/users', async (req, res) => {
            const userInfo = req.body;
            console.log(userInfo)
            userInfo.role = "Buyer";
            userInfo.createdAt = new Date();
            const result = await userCollection.insertOne(userInfo);
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