# HindHolidays — Local Setup

**Frontend:** http://localhost:5173  
**API:** http://localhost:5000/api  

This project runs locally. It is not connected to GitHub or a remote server.

## Stack

- React (Vite) + Tailwind + Axios
- Node.js + Express + MongoDB + JWT

## 1. MongoDB

```
MONGO_URI=mongodb://127.0.0.1:27017/travel_crm
```

## 2. Backend

```bash
cd backend
cp .env.example .env
# Edit .env: MONGO_URI, JWT_SECRET, CORS_ORIGINS

npm install
npm run seed
npm run dev
```

Health check: `GET http://localhost:5000/api/health`

### Seed logins (default password `123456`)

| Email | Role |
|-------|------|
| admin@crm.com | Admin |
| manager@crm.com | Sales Manager |
| leader@crm.com | Team Leader |
| executive@crm.com | Sales Executive |
| operations@crm.com | Operations Manager |
| accountant@crm.com | Accountant |

## 3. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Frontend: **http://localhost:5173**

## 4. Environment summary

| Variable | Location | Example |
|----------|----------|---------|
| `VITE_API_URL` | frontend `.env` | `http://localhost:5000/api` |
| `MONGO_URI` | backend `.env` | `mongodb://127.0.0.1:27017/travel_crm` |
| `JWT_SECRET` | backend `.env` | long random string |
| `PORT` | backend `.env` | `5000` |
| `CORS_ORIGINS` | backend `.env` | `http://localhost:5173` |
