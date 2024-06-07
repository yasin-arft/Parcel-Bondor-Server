const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jzumutc.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// middlewares
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Parcel Bondor server is running')
});


async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const userCollection = client.db('parcelBondorDB').collection('users');
    const bookingCollection = client.db('parcelBondorDB').collection('bookings');

    // user related apis
    app.get('/users/:email', async (req, res) => {
      const query = { email: req.params.email };
      const result = await userCollection.findOne(query);
      res.send(result);
    });

    app.post('/users', async (req, res) => {
      const user = req.body;

      // check whether user already exits
      const query = { email: user.email };
      const alreadyExits = await userCollection.findOne(query);
      if (alreadyExits) {
        return res.send({ message: 'user already exits', insertedId: null })
      }

      // if not exits then store data
      const result = await userCollection.insertOne(user);
      res.send(result);
    });


    // booking related apis
    app.get('/booking/:id', async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await bookingCollection.findOne(query);
      res.send(result);
    });

    app.get('/bookings/:email', async (req, res) => {
      const query = { email: req.params.email };
      const result = await bookingCollection.find(query).toArray();
      res.send(result);
    });

    app.post('/bookings', async (req, res) => {
      const data = req.body;
      const result = await bookingCollection.insertOne(data);
      res.send(result);
    });

    app.patch('/bookings/:id', async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const data = req.body;
      const updatedDoc = {
        $set: {
          name: data.name,
          email: data.email,
          phone: data.phone,
          type: data.type,
          weight: data.weight,
          price: data.price,
          receiverName: data.receiverName,
          receiverPhone: data.receiverPhone,
          deliveryAddress: data.deliveryAddress,
          requestedDeliveryDate: data.requestedDeliveryDate,
          deliveryLatitude: data.deliveryLatitude,
          deliveryLongitude: data.deliveryLongitude,
        }
      }

      const result = await bookingCollection.updateOne(query, updatedDoc);
      res.send(result);
    });

    app.delete('/bookings/:id', async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await bookingCollection.deleteOne(query);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.listen(port, () => {
  console.log(`Parcel Bondor server running on PORT: ${port}`);
})