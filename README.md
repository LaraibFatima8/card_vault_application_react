# CardVault Application

A digital business card management application built with Next.js, Firebase, and the Gemini AI API.

## Features

- **Business Card Scanning**: Upload images or use your camera to capture business cards
- **AI-Powered OCR**: Extract contact information using Google's Gemini AI
- **Firebase Storage**: Store and manage your business card data in the cloud
- **Real-time Updates**: See changes instantly across all connected devices
- **CSV Export**: Download your business card data as a CSV file
- **CRUD Operations**: Create, read, update, and delete business card entries
- **Mobile-Friendly**: Responsive design that works on all devices

## Setup Instructions

### 1. Firebase Configuration

1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or use an existing one
3. Enable Firestore Database
4. Enable Authentication (Anonymous authentication)
5. Get your Firebase configuration from Project Settings > General > Your apps
6. Update the `.env.local` file with your Firebase credentials

### 2. Gemini AI API

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create an API key for the Gemini API
3. Add the API key to your `.env.local` file

### 3. Environment Variables

Update the `.env.local` file with your actual values:

```env
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id_here
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id_here
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id_here

# Gemini API Configuration
NEXT_PUBLIC_GEMINI_API_KEY=your_gemini_api_key_here

# App Configuration
NEXT_PUBLIC_APP_ID=card-vault-app
```

### 4. Firebase Security Rules

Set up Firestore security rules to allow read/write access:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /artifacts/{appId}/public/data/companyCards/{document} {
      allow read, write: if true;
    }
  }
}
```

## Installation and Running

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

1. **Upload a Business Card**: Click "Choose Image" to upload a photo or "Take Picture" to use your camera
2. **AI Processing**: The app will automatically extract contact information using AI
3. **View Cards**: Browse your saved business cards in the left panel
4. **Edit/Delete**: Select a card to view details and edit or delete it
5. **Export Data**: Click "Download CSV" to export all your data

## Technologies Used

- **Next.js 14**: React framework for production
- **Firebase**: Backend as a Service (Firestore + Auth)
- **Google Gemini AI**: AI-powered OCR for text extraction
- **Tailwind CSS**: Utility-first CSS framework
- **TypeScript**: Type-safe JavaScript

## Project Structure

```
card_vault_application/
├── app/
│   ├── globals.css       # Global styles
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Main application component
├── .env.local            # Environment variables
├── next.config.js        # Next.js configuration
├── package.json          # Dependencies and scripts
├── tailwind.config.js    # Tailwind CSS configuration
└── postcss.config.js     # PostCSS configuration
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is open source and available under the [MIT License](LICENSE).
