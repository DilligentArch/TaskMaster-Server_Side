const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.2x9eo.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Initialize MongoDB Client
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Connect to MongoDB
async function connectDB() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB!");
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
    process.exit(1);
  }
}
connectDB();

const db = client.db("TaskMaster");
const taskCollection = db.collection("tasks");
const userCollection = db.collection("users");

app.post("/users", async (req, res) => {
  const { email, name, image} = req.body;

  try {
    // Check if a user with the given email already exists
    const existingUser = await userCollection.findOne({ email });

    if (existingUser) {
      return res.status(200).send({ message: "User already exists" });
    }

    // Add the new user to the database
    const newUser = {
      email,
      name,
      image,
     // Default to false if isAdmin is not provided
      createdAt: new Date().toISOString(),
    };

    const result = await userCollection.insertOne(newUser);

    res.status(201).send({ message: "User added successfully", result });
  } catch (error) {
    console.error("Error adding user:", error);
    res.status(500).send({ message: "Failed to add user", error });
  }
});

app.post("/tasks", async (req, res) => {
  const taskData = req.body;
  const result = await taskCollection.insertOne(taskData);
  res.send(result);
});

app.get("/tasks/:email", async (req, res) => {
  const email = req.params.email;
  const query = { email: email };
  const result = await taskCollection.find(query).toArray();
  res.send(result);
});

// updating a task
app.patch("/tasks/:id", async (req, res) => {
  const id = req.params.id;
  const updatedTask = req.body;
  const filter = { _id: new ObjectId(id) };
  const updateDoc = {
    $set: updatedTask,
  };
  const result = await taskCollection.updateOne(filter, updateDoc);
  res.send(result);
});

// Deleting a task
app.delete("/tasks/:id", async (req, res) => {
  const id = req.params.id;
  const filter = { _id: new ObjectId(id) };
  const result = await taskCollection.deleteOne(filter);
  res.send(result);
});








// Health Check Route
app.get("/", (req, res) => {
  res.send("Server is running successfully!");
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});