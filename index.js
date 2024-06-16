const express = require('express');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
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
app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
    "https://parcel-bondor.web.app",
    "https://parcel-bondor.firebaseapp.com",
  ]
}));
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Parcel Bondor server is running')
});

// jwt api 
app.post('/jwt', async (req, res) => {
  const user = req.body;
  const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
  res.send({ token });
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const userCollection = client.db('parcelBondorDB').collection('users');
    const bookingCollection = client.db('parcelBondorDB').collection('bookings');
    const reviewCollection = client.db('parcelBondorDB').collection('reviews');

    // ----------- user related apis --------------
    // users by role
    app.get('/users', async (req, res) => {
      const role = req.query.role;
      let query = {}
      if (role) {
        query = { role }
      }

      const result = await userCollection.find(query).toArray();
      res.send(result);
    });

    app.get('/totalUser', async (req, res) => {
      const query = { role: 'user' };
      const totalUser = await userCollection.countDocuments(query);

      res.send({ totalUser })
    });

    // get users with bookings data
    app.get('/users/user', async (req, res) => {
      const page = req.query.page;

      const result = await userCollection.aggregate([
        {
          $match: {
            role: 'user'
          }
        },
        {
          $lookup: {
            from: 'bookings',
            localField: 'email',
            foreignField: 'email',
            as: 'myBookings'
          }
        },
        {
          $addFields: {
            totalBookings: { $size: '$myBookings' },
            totalSpent: { $sum: '$myBookings.price' }
          }
        },
        {
          $project: {
            name: 1,
            phoneNumber: 1,
            totalBookings: 1,
            totalSpent: 1,
          }
        }
      ]).skip(page * 5).limit(5).toArray();

      res.send(result);
    });

    // get delivery men with delivery data
    app.get('/users/deliveryman', async (req, res) => {
      const result = await userCollection.aggregate([
        {
          $match: {
            role: 'deliveryMan'
          }
        },
        {
          $lookup: {
            from: 'bookings',
            let: { userId: { $toString: '$_id' } },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$deliveryManId', '$$userId'] },
                      { $eq: ['$status', 'Delivered'] }
                    ]
                  }
                }
              }
            ],
            as: 'myDeliveries'
          }
        },
        {
          $lookup: {
            from: 'reviews',
            let: { userId: { $toString: '$_id' } },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: ['$deliveryManId', '$$userId']
                  }
                }
              }
            ],
            as: 'myReviews'
          }
        },
        {
          $addFields: {
            totalDelivered: { $size: '$myDeliveries' },
            averageRatings: {
              $round: [
                { $avg: '$myReviews.rating' },
                1
              ]
            }
          }
        },
        {
          $project: {
            name: 1,
            phoneNumber: 1,
            totalDelivered: 1,
            averageRatings: 1,
          }
        }
      ]).toArray();

      res.send(result);
    });

    // top 3 delivery men
    app.get('/topThreeDeliverymen', async (req, res) => {
      const result = await userCollection.aggregate([
        {
          $match: {
            role: 'deliveryMan'
          }
        },
        {
          $lookup: {
            from: 'bookings',
            let: { userId: { $toString: '$_id' } },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$deliveryManId', '$$userId'] },
                      { $eq: ['$status', 'Delivered'] }
                    ]
                  }
                }
              }
            ],
            as: 'myDeliveries'
          }
        },
        {
          $lookup: {
            from: 'reviews',
            let: { userId: { $toString: '$_id' } },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: ['$deliveryManId', '$$userId']
                  }
                }
              }
            ],
            as: 'myReviews'
          }
        },
        {
          $addFields: {
            totalDelivered: { $size: '$myDeliveries' },
            averageRatings: {
              $round: [
                { $avg: '$myReviews.rating' },
                1
              ]
            }
          }
        },
        {
          $project: {
            name: 1,
            image: 1,
            totalDelivered: 1,
            averageRatings: 1,
          }
        },
        {
          $sort: {
            totalDelivered: -1,
            averageRatings: -1
          }
        },
        {
          $limit: 3
        }
      ]).toArray();

      res.send(result);
    });

    // single user
    app.get('/users/:email', async (req, res) => {
      const query = { email: req.params.email };
      const result = await userCollection.findOne(query);
      res.send(result);
    });

    // add users
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

    // update user by admin
    app.patch('/users/adminUpdate/:id', async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const data = req.body;
      const updatedDoc = {
        $set: {
          role: data.role
        }
      }

      const result = await userCollection.updateOne(query, updatedDoc);
      res.send(result);
    });

    // update user by profile photo
    app.patch('/users/:id', async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const updatedDoc = {
        $set: {
          image: req.body.image
        }
      }

      const result = await userCollection.updateOne(query, updatedDoc);
      res.send(result);
    });




    // ----------- booking related apis --------------
    // home states
    app.get('/homeStats', async (req, res) => {
      const totalBookings = await bookingCollection.estimatedDocumentCount();
      const totalDelivered = await bookingCollection.countDocuments({ status: 'Delivered' });
      const totalUsers = await userCollection.estimatedDocumentCount();

      res.send({ totalBookings, totalDelivered, totalUsers })
    });

    // bookings state
    app.get('/bookingStats', async (req, res) => {
      const result = await bookingCollection.aggregate([
        {
          $project: {
            date: { $substr: ["$bookingDate", 0, 10] }
          }
        },
        {
          $group: {
            _id: "$date",
            totalBookings: { $sum: 1 }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ]).toArray();

      res.send(result);
    });

    // all bookings
    app.get('/bookings', async (req, res) => {
      const queries = req.query;
      let filter = {}
      if (queries.fromDate && queries.toDate) {
        filter = {
          requestedDeliveryDate: {
            $gte: queries.fromDate,
            $lte: queries.toDate
          }
        }
      }

      const result = await bookingCollection.find(filter).toArray();
      res.send(result);
    });

    // single booking
    app.get('/booking/:id', async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await bookingCollection.findOne(query);
      res.send(result);
    });

    // booked by user
    app.get('/bookings/:email', async (req, res) => {
      let filter = {
        email: req.params.email
      };

      if (req.query.status) {
        filter = {
          email: req.params.email,
          status: req.query.status
        };
      }

      const result = await bookingCollection.find(filter).toArray();
      res.send(result);
    });

    // booking assigned to delivery man
    app.get('/bookings/deliveryman/:id', async (req, res) => {
      const query = { deliveryManId: req.params.id };
      const result = await bookingCollection.find(query).toArray();
      res.send(result);
    });

    // add bookings
    app.post('/bookings', async (req, res) => {
      const data = req.body;
      const result = await bookingCollection.insertOne(data);
      res.send(result);
    });

    // update booking by user
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

    // update booking by admin
    app.patch('/bookings/adminUpdate/:id', async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const data = req.body;
      const updatedDoc = {
        $set: {
          deliveryManId: data.deliveryManId,
          approxDeliveryDate: data.approxDeliveryDate,
          status: data.status
        }
      }
      const options = { upsert: true };

      const result = await bookingCollection.updateOne(query, updatedDoc, options);
      res.send(result);
    });

    // update booking by deliveryman
    app.patch('/bookings/deliveryman/:id', async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const data = req.body;
      const updatedDoc = {
        $set: {
          status: data.status
        }
      }

      const result = await bookingCollection.updateOne(query, updatedDoc);
      res.send(result);
    });

    // delete booking by user
    app.delete('/bookings/:id', async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await bookingCollection.deleteOne(query);
      res.send(result);
    });


    // ----------- review related apis --------------
    app.get('/reviews/:deliveryManId', async (req, res) => {
      const query = { deliveryManId: req.params.deliveryManId }

      const result = await reviewCollection.find(query).toArray();
      res.send(result);
    });

    // store reviews
    app.post('/reviews', async (req, res) => {
      const data = req.body;

      // check already whether reviewed
      const query = { bookingId: data.bookingId };
      const alreadyExits = await reviewCollection.findOne(query);
      if (alreadyExits) {

        // if exits then update
        const updatedDoc = {
          $set: {
            rating: data.rating,
            feedback: data.feedback,
            date: data.date
          }
        }

        const result = await reviewCollection.updateOne(query, updatedDoc);
        res.send(result);
      } else {

        // if not exits then add
        const result = await reviewCollection.insertOne(data);
        res.send(result);
      }

    }),


      // Send a ping to confirm a successful connection
      // await client.db("admin").command({ ping: 1 });
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