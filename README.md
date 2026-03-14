# Job Assistant & Discovery Platform

A premium, full-stack job search and discovery platform that aggregates listings from major job boards (**JSearch**, **Adzuna**, **Remotive**, and **The Muse**) to provide a personalized, match-centric experience.

![Hero Image](file:///home/sukesh/Documents/Project/src/assets/hero.png)

## 🚀 Features

- **Personalized Job Aggregator**: Concurrently fetches jobs from 4 different platforms and normalizes the data into a unified, clean feed.
- **Smart Discovery**: Matches job listings to your specific skills and preferred roles gathered during onboarding.
- **Secure Authentication**: 
  - Token-based authentication using **JWT**.
  - Password security with **bcryptjs** hashing.
  - **Google OAuth 2.0** integration for quick access.
- **Intelligent Onboarding**: A one-time, database-backed onboarding flow that ensures your preferences are saved across devices.
- **Premium Glassmorphic UI**: A modern, responsive design built with React and advanced CSS, featuring skeleton loaders and micro-animations.

## 🛠️ Tech Stack

- **Frontend**: React (Vite), React Router, @react-oauth/google
- **Backend**: Node.js, Express, Axios
- **Database**: MongoDB Atlas (Mongoose)
- **Security**: JWT, bcryptjs

## 📦 Getting Started

### Prerequisites

- Node.js installed
- MongoDB Atlas account (for the database URI)
- RapidAPI Key (for JSearch)
- Adzuna App ID/Key
- The Muse API Key

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Sukesh-2006-cse/Job_Assistent.git
   cd Job_Assistent
   ```

2. **Install dependencies**:
   ```bash
   # Root (Frontend)
   npm install
   
   # Server (Backend)
   cd server
   npm install
   cd ..
   ```

3. **Environment Setup**:
   Create a `.env` file in the `server/` directory and add your credentials:
   ```env
   MONGODB_URI=your_mongodb_uri
   PORT=5000
   JWT_SECRET=your_secret
   JSEARCH_KEY=your_key
   ADZUNA_ID=your_id
   ADZUNA_KEY=your_key
   MUSE_KEY=your_key
   ```

4. **Add Google Client ID**:
   Update the `clientId` in `src/main.jsx` with your Google Cloud Console Client ID.

### Running the App

Run both frontend and backend simultaneously:
```bash
npm run start:all
```

## 📄 License

This project is licensed under the MIT License.
