const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config(); // ✅ 
const app = express();
const port = process.env.PORT || 5000; 

// Middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.2x9eo.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// MongoDB Client
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect(); // ✅ Keep connection open

    const userCollection = client.db("TaskMaster").collection("users");

    // ✅ POST route for adding users
    app.post("/users", async (req, res) => {
      const { email, name, image, isAdmin } = req.body;

      try {
        // Check if user already exists
        const existingUser = await userCollection.findOne({ email });

        if (existingUser) {
          return res.status(200).send({ message: "User already exists" });
        }

        // Create new user
        const newUser = {
          email,
          name,
          image,
          isAdmin: isAdmin || false, // Default to false
          createdAt: new Date().toISOString(),
        };

        const result = await userCollection.insertOne(newUser);
        res.status(201).send({ message: "User added successfully", result });
      } catch (error) {
        console.error("Error adding user:", error);
        res.status(500).send({ message: "Failed to add user", error });
      }
    });

    // ✅ Health Check Route
    app.get('/', (req, res) => {
      res.send('Server is running successfully!');
    });

    // ✅ Ping MongoDB to verify connection
    await client.db("admin").command({ ping: 1 });
    console.log("✅ Connected to MongoDB!");
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
  }
}

run().catch(console.dir);

// Start Server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
