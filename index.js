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

// GET /tasks: Fetch tasks for a specific user (by email)
app.get("/tasks", async (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json({ message: "Email is required" });
  try {
    const tasks = await taskCollection.find({ email }).sort({ order: 1 }).toArray();
    res.json(tasks.map(task => ({ ...task, _id: task._id.toString() })));
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch tasks", error });
  }
});

// POST /tasks: Add a new task (FIXED ORDER CALCULATION)
app.post("/tasks", async (req, res) => {
  const { title, description, category, email } = req.body;
  if (!title || !category || !email) {
    return res.status(400).json({ message: "Title, category, and email are required!" });
  }
  try {
    
    const taskCount = await taskCollection.countDocuments({ 
      category, 
      email,
      order: { $exists: true } // ADDED THIS LINE
    });
    
    const newTask = {
      title,
      description: description || "",
      category,
      email,
      order: taskCount + 1,
      createdAt: new Date().toISOString(),
    };
    const result = await taskCollection.insertOne(newTask);
    res.status(201).json({ message: "Task added successfully", result });
  } catch (error) {
    res.status(500).json({ message: "Failed to add task", error });
  }
});

// PUT /tasks/:id: Update a task (IMPROVED CATEGORY CHANGE HANDLING)
app.put("/tasks/:id", async (req, res) => {
  const { id } = req.params;
  const updatedFields = req.body;
  if (!updatedFields.email) {
    return res.status(400).json({ message: "Email is required for updating" });
  }
  try {
    const existingTask = await taskCollection.findOne({ _id: new ObjectId(id) });
    if (!existingTask) {
      return res.status(404).json({ message: "Task not found" });
    }
    if (existingTask.email !== updatedFields.email) {
      return res.status(403).json({ message: "Unauthorized: You cannot update this task" });
    }

    // HANDLE CATEGORY CHANGE FIRST
    if (updatedFields.category && updatedFields.category !== existingTask.category) {
      // Get new category count
      const newCategoryCount = await taskCollection.countDocuments({
        category: updatedFields.category,
        email: existingTask.email
      });

      // Update with new order position
      await taskCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { 
          ...updatedFields,
          order: newCategoryCount + 1 
        }}
      );
    } else {
      // Regular update
      const result = await taskCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedFields }
      );
    }

    // REORDER BOTH CATEGORIES IF CATEGORY CHANGED
    if (updatedFields.category && updatedFields.category !== existingTask.category) {
      // Reorder old category
      const oldCategoryTasks = await taskCollection
        .find({ category: existingTask.category, email: existingTask.email })
        .sort({ order: 1 })
        .toArray();
        
      const bulkOpsOld = oldCategoryTasks.map((task, index) => ({
        updateOne: {
          filter: { _id: task._id },
          update: { $set: { order: index + 1 } },
        },
      }));
      if (bulkOpsOld.length > 0) await taskCollection.bulkWrite(bulkOpsOld);

      // Reorder new category
      const newCategoryTasks = await taskCollection
        .find({ category: updatedFields.category, email: existingTask.email })
        .sort({ order: 1 })
        .toArray();
        
      const bulkOpsNew = newCategoryTasks.map((task, index) => ({
        updateOne: {
          filter: { _id: task._id },
          update: { $set: { order: index + 1 } },
        },
      }));
      if (bulkOpsNew.length > 0) await taskCollection.bulkWrite(bulkOpsNew);
    }

    res.json({ message: "Task updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to update task", error });
  }
});

// DELETE /tasks/:id: Delete a task
app.delete("/tasks/:id", async (req, res) => {
  const { id } = req.params;
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required" });
  try {
    const deletedTask = await taskCollection.findOne({ _id: new ObjectId(id) });
    if (!deletedTask) {
      return res.status(404).json({ message: "Task not found" });
    }
    if (deletedTask.email !== email) {
      return res.status(403).json({ message: "Unauthorized: You cannot delete this task" });
    }
    await taskCollection.deleteOne({ _id: new ObjectId(id) });

    // Reorder remaining tasks
    const remainingTasks = await taskCollection
      .find({ category: deletedTask.category, email })
      .sort({ order: 1 })
      .toArray();
      
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

// PUT /tasks/reorder: Reorder tasks (FIXED FILTER)
app.put("/tasks/reorder", async (req, res) => {
  const updatedTasks = req.body;
  const email = req.query.email;
  
  if (!email) return res.status(400).json({ message: "Email is required" });
  if (
    !Array.isArray(updatedTasks) ||
    updatedTasks.some(task => !task._id || task.order === undefined)
  ) {
    return res.status(400).json({ message: "Invalid data format" });
  }
  try {
   
    const bulkOps = updatedTasks.map((task) => ({
      updateOne: {
        filter: { 
          _id: new ObjectId(task._id), 
          email: email,
          category: task.category // ADDED THIS LINE
        },
        update: { $set: { order: task.order } },
      },
    }));
    
    const result = await taskCollection.bulkWrite(bulkOps);
    res.json({ message: "Tasks reordered successfully", result });
  } catch (error) {
    res.status(500).json({ message: "Failed to reorder tasks", error });
  }
});

// Health Check Route
app.get("/", (req, res) => {
  res.send("Server is running successfully!");
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});