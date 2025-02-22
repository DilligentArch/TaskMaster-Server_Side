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

// MongoDB Client
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

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

// ✅ Fetch All Tasks (Sorted)
app.get("/tasks", async (req, res) => {
  try {
    const tasks = await taskCollection.find().sort({ order: 1 }).toArray();
    res.json(tasks.map(task => ({ ...task, _id: task._id.toString() })));
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch tasks", error });
  }
});

// ✅ Add a New Task
app.post("/tasks", async (req, res) => {
  const { title, description, category } = req.body;
  if (!title || !category) {
    return res.status(400).json({ message: "Title and category are required!" });
  }

  try {
    const taskCount = await taskCollection.countDocuments({ category });
    const newTask = {
      title,
      description: description || "",
      category,
      order: taskCount + 1,
      createdAt: new Date().toISOString(),
    };

    const result = await taskCollection.insertOne(newTask);
    res.status(201).json({ message: "Task added successfully", result });
  } catch (error) {
    res.status(500).json({ message: "Failed to add task", error });
  }
});

// ✅ Update Task
app.put("/tasks/:id", async (req, res) => {
  const { id } = req.params;
  const updatedTask = req.body;

  try {
    const existingTask = await taskCollection.findOne({ _id: new ObjectId(id) });
    if (!existingTask) {
      return res.status(404).json({ message: "Task not found" });
    }

    updatedTask.order = updatedTask.order || existingTask.order;

    const result = await taskCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedTask }
    );
    res.json({ message: "Task updated successfully", result });
  } catch (error) {
    res.status(500).json({ message: "Failed to update task", error });
  }
});

// ✅ Delete Task (Reorders Remaining Tasks)
app.delete("/tasks/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const deletedTask = await taskCollection.findOne({ _id: new ObjectId(id) });
    if (!deletedTask) {
      return res.status(404).json({ message: "Task not found" });
    }

    await taskCollection.deleteOne({ _id: new ObjectId(id) });

    const remainingTasks = await taskCollection.find({ category: deletedTask.category }).sort({ order: 1 }).toArray();
    const bulkOps = remainingTasks.map((task, index) => ({
      updateOne: {
        filter: { _id: task._id },
        update: { $set: { order: index + 1 } },
      },
    }));

    if (bulkOps.length > 0) {
      await taskCollection.bulkWrite(bulkOps);
    }

    res.json({ message: "Task deleted and reordered successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete task", error });
  }
});

// Start Server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
