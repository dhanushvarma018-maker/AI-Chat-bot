# 🌌 Gemini AI Full-Stack Chatbot with Supabase Database

A high-performance, modern AI chatbot powered by the **Google Gemini LLM** (`gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-pro`) and **Supabase Database** (PostgreSQL), built with an explicit separation of concerns between the **frontend** and **backend**.

---

## 📁 Architectural Difference: Frontend vs Backend

```
ANTI/
├── backend/                  # 🛡️ Backend Server (Node.js & Express)
│   ├── .env.example          # Backend environment variable template
│   ├── .env                  # Backend private API keys & database credentials
│   ├── package.json          # Dependencies: @google/genai, @supabase/supabase-js, express, cors, dotenv
│   ├── server.js             # Express API server, SSE streaming, Supabase routes & CORS
│   ├── geminiService.js      # Gemini LLM integration via @google/genai SDK
│   └── supabaseService.js    # Supabase PostgreSQL database service
│
├── frontend/                 # 🎨 Standalone Client Interface (HTML/CSS/JS)
│   ├── .env.example          # Frontend environment variable template
│   ├── .env                  # Frontend client credentials & backend URL
│   ├── index.html            # Semantic HTML5 layout with live DB & backend status pills
│   ├── style.css             # Glassmorphism, modern cyber-dark design system
│   ├── script.js             # Client controller, SSE stream parser, markdown renderer
│   └── assets/               # Generated AI avatar & iconography
│       └── avatar.jpg
│
├── supabase_schema.sql       # 🗄️ One-click database table & RLS policies setup script
└── README.md                 # Complete documentation & configuration guide
```

---

## 🔐 Environment Variables (`.env`)

### 1. Backend: `backend/.env`
Used securely on the server-side to communicate with Google Gemini and Supabase:

| Variable | Description | Example |
| :--- | :--- | :--- |
| `PORT` | Local port for Express API server | `3001` |
| `GEMINI_API_KEY` | Google Gemini API Key ([Get free key](https://aistudio.google.com/app/apikey)) | `AIzaSy...` |
| `GEMINI_MODEL` | Default Gemini model ID | `gemini-2.5-flash` |
| `SUPABASE_URL` | Supabase Project URL | `https://xyzproject.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase Public Anonymous API Key | `eyJhbGciOiJI...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional: Secret service role key for elevated backend access | `eyJhbGciOiJI...` |

### 2. Frontend: `frontend/.env`
Used on the client-side for connecting to the backend server and Supabase client:

| Variable | Description | Example |
| :--- | :--- | :--- |
| `BACKEND_URL` | URL of the backend Express API | `http://localhost:3001` |
| `SUPABASE_URL` | Supabase Project URL | `https://xyzproject.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase Public Anonymous Key (safe for browser) | `eyJhbGciOiJI...` |

---

## 🗄️ Supabase Database Setup

1. Log into your [Supabase Dashboard](https://supabase.com/dashboard) and create a project (or select an existing one).
2. Go to **SQL Editor** -> Click **New Query**.
3. Copy the contents of [`supabase_schema.sql`](file:///c:/Users/danus/OneDrive/Desktop/ANTI/supabase_schema.sql) and paste into the editor.
4. Click **Run**. This creates:
   - `conversations` table (stores chat sessions, titles, timestamps, and models).
   - `messages` table (stores each user and bot response, linked to `conversation_id`).
   - Indexes and Row Level Security (RLS) policies allowing secure reading/writing.
5. In Supabase, go to **Project Settings** -> **API** to copy your **Project URL** and **anon public key**.
6. Paste them into `backend/.env` and `frontend/.env`!

---

## 🚀 Quick Start Guide

### Step 1: Configure Environment Variables
Open [`backend/.env`](file:///c:/Users/danus/OneDrive/Desktop/ANTI/backend/.env) and [`frontend/.env`](file:///c:/Users/danus/OneDrive/Desktop/ANTI/frontend/.env) and fill in your keys.

### Step 2: Start the Backend Server
```powershell
cd backend
npm install
npm start
```

### Step 3: Open the Frontend
Open **[http://localhost:3001](http://localhost:3001)** in your browser. Both the backend and database connection indicators in the header will glow green once configured!
