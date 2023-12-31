 
const express = require('express')
const app = express()
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const stripe = require('stripe')(process.env.STRIPE_SECRET)

const jwt = require('jsonwebtoken');

const port = process.env.PORT || 3000    

// middleware
 app.use(cors());
 app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qegvawy.mongodb.net/?retryWrites=true&w=majority`;

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
    // await client.connect();
    const userCollection = client.db("buildingDB").collection('users');
    const apartmentCollection = client.db('buildingDB').collection('apartment')
    const cartCollection = client.db('buildingDB').collection('carts')
    const announcementCollection = client.db('buildingDB').collection('announcement')
    const paymentCollection = client.db('buildingDB').collection('payments')

    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token });
     })

    // middlewares 
    const verifyToken = (req, res, next) => {
      console.log('inside verify token', req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unauthorized access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'unauthorized access' })
        }
         req.decoded = decoded;
        next();
      })
    }

     const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      console.log(email);
      const query = { email: email };
      const user = await userCollection.findOne(query);
       const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    }

      // users related api
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      
      res.send(result);
    });

    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' })
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'admin';
        res.send({ admin });
      }
    })

    app.post('/users', async (req, res) => {
      const user = req.body;
       
      const query = { email: user.email }
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'user already exists', insertedId: null })
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: 'admin'
        }
      }
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })

    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await userCollection.deleteOne(query);
      res.send(result);
    })


    // apartments related api
    app.get('/apartments', async(req, res)=>{
         const result = await apartmentCollection.find().toArray()
        res.send(result)
    })

    app.get('/carts', async(req,res)=>{
      const email = req.query.email
      const query = {email: email}
      const result = await cartCollection.find(query).toArray()
      res.send(result)
    })

     app.delete('/carts/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id:  id }
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    })
 
    app.get('/apartmentCount', async(req, res)=>{
      const count = await apartmentCollection.estimatedDocumentCount()
      res.send({count})
    })


      app.get('/page-apartment', async(req,res)=>{
      const page = parseInt(req.query.page)
      const size = parseInt(req.query.size)
          
        const result = await apartmentCollection.find()
        .skip(page * size)
        .limit(size)
        .toArray()
        res.send(result)
    })

    // carts collection

    app.post('/carts', verifyToken, async (req, res) => {
      const cartItem = req.body;
      delete cartItem._id
      const result = await cartCollection.insertOne(cartItem);
      res.send(result);

    });

    // menu
     app.post('/announcement', verifyToken, verifyAdmin, async (req, res) => {
      const item = req.body
      const result = await announcementCollection.insertOne(item)
      res.send(result)
     })

     app.get('/announcement',  async(req, res)=>{
      const result = await announcementCollection.find().toArray()
      res.send(result)

     })

    // payment

    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price) * 100;
       

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });
 
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    });

    app.get('/payments/:email', verifyToken, async(req, res)=>{
      const query = {email: req.params.email}
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({message: 'forbidden access'})
      }
      const result = await paymentCollection.find(query).toArray()
      res.send(result)
    })

    app.post('/payments', async(req,res)=>{
      const payment = req.body
      const paymentResult = await paymentCollection.insertOne(payment) 
      const query = {_id: {
        $in: payment.cartIds.map(id => new ObjectId(id))
      }}
      const deleteResult = await cartCollection.deleteMany(query)
      res.send({paymentResult,deleteResult})
    })



    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})