'use client';

import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, Auth } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc, Firestore } from 'firebase/firestore';

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Debug: Log Firebase config to check if environment variables are loaded
console.log('Firebase Config:', firebaseConfig);

const appId = process.env.NEXT_PUBLIC_APP_ID || 'card-vault-app';

interface CompanyData {
  id: string;
  companyName?: string;
  contactPerson?: string;
  phoneNumber?: string;
  email?: string;
  website?: string;
  address?: string;
  timestamp?: number;
  uploadedBy?: string;
}

function App() {
  const [db, setDb] = useState<Firestore | null>(null);
  const [auth, setAuth] = useState<Auth | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [companies, setCompanies] = useState<CompanyData[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [companyToDelete, setCompanyToDelete] = useState<CompanyData | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState<Partial<CompanyData>>({});

  // State for camera functionality
  const [showCameraModal, setShowCameraModal] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize Firebase and set up auth listener
  useEffect(() => {
    try {
      // Validate Firebase configuration
      if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
        throw new Error('Firebase configuration is incomplete. Please check your environment variables.');
      }

      console.log('Initializing Firebase with config:', firebaseConfig);
      const app = initializeApp(firebaseConfig);
      const firestoreDb = getFirestore(app);
      const firebaseAuth = getAuth(app);

      console.log('Firebase initialized successfully');
      setDb(firestoreDb);
      setAuth(firebaseAuth);

      const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
        if (user) {
          console.log('User already signed in:', user.uid);
          setUserId(user.uid);
        } else {
          try {
            console.log('Attempting anonymous sign-in...');
            await signInAnonymously(firebaseAuth);
            console.log('Anonymous sign-in successful');
            setUserId(firebaseAuth.currentUser?.uid || crypto.randomUUID());
          } catch (error) {
            console.error("Error during authentication:", error);
            setMessage(`Authentication failed: ${error.message}`);
            setUserId(crypto.randomUUID());
          }
        }
        setIsAuthReady(true);
      });

      return () => unsubscribe();
    } catch (error) {
      console.error("Error initializing Firebase:", error);
      setMessage(`Firebase initialization failed: ${error.message}`);
    }
  }, []);

  // Fetch company data when auth is ready and db is available
  useEffect(() => {
    if (db && isAuthReady && userId) {
      const companyCollectionRef = collection(db, `artifacts/${appId}/public/data/companyCards`);
      const q = query(companyCollectionRef);

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const companyList: CompanyData[] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as CompanyData));
        companyList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setCompanies(companyList);
      }, (error) => {
        console.error("Error fetching companies:", error);
        setMessage(`Error loading companies: ${error.message}`);
      });

      return () => unsubscribe();
    }
  }, [db, isAuthReady, userId]);

  // Function to process image data
  const processImageData = async (base64Data, mimeType) => {
    setLoading(true);
    setMessage('Extracting information...');

    try {
      const prompt = `Extract the following information from the business card image and return it as a JSON object. If a field is not found, use an empty string. Prioritize the most prominent information for each field.

      \`\`\`json
      {
        "companyName": "",
        "contactPerson": "",
        "phoneNumber": "",
        "email": "",
        "website": "",
        "address": ""
      }
      \`\`\`
      `;

      const payload = {
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Data
                }
              }
            ]
          }
        ],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    "companyName": { "type": "STRING" },
                    "contactPerson": { "type": "STRING" },
                    "phoneNumber": { "type": "STRING" },
                    "email": { "type": "STRING" },
                    "website": { "type": "STRING" },
                    "address": { "type": "STRING" }
                },
                "propertyOrdering": ["companyName", "contactPerson", "phoneNumber", "email", "website", "address"]
            }
        }
      };

      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (!apiKey) {
        setMessage('Gemini API key not configured. Please set NEXT_PUBLIC_GEMINI_API_KEY in your environment variables.');
        return;
      }

      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error("Gemini API request failed:", response.status, response.statusText, errorBody);
        setMessage(`Error from API: ${response.status} ${response.statusText}. Check console for details.`);
        return;
      }

      const result = await response.json();

      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const jsonString = result.candidates[0].content.parts[0].text;
        let extractedData;
        try {
          extractedData = JSON.parse(jsonString);
        } catch (parseError) {
          console.error("Failed to parse JSON from Gemini API:", parseError, "Raw response:", jsonString);
          setMessage('Failed to parse extracted data. Please try again or a different image.');
          return;
        }

        if (db) {
          const companyCollectionRef = collection(db, `artifacts/${appId}/public/data/companyCards`);
          await addDoc(companyCollectionRef, {
            ...extractedData,
            timestamp: Date.now(),
            uploadedBy: userId
          });
          setMessage('Information extracted and saved successfully!');
        } else {
          setMessage('Database not initialized. Please try again.');
        }
      } else {
        setMessage('Could not extract information. The API response was unexpected or empty.');
        console.error("Gemini API response structure unexpected or empty candidates:", result);
      }
    } catch (error) {
      console.error("Error during OCR, network request, or saving:", error);
      setMessage(`An unexpected error occurred: ${error.message}. Check console for details.`);
    } finally {
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setShowCameraModal(false);
      stopCamera();
    }
  };

  // Handler for file input change
  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setMessage('No file selected.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      if (!reader.result || typeof reader.result !== 'string') {
        setMessage('Failed to read image file.');
        setLoading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }
      const base64Data = reader.result.split(',')[1];
      if (!base64Data) {
        setMessage('Could not process image data. Please try a different file.');
        setLoading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }
      processImageData(base64Data, file.type || 'image/jpeg');
    };
    reader.readAsDataURL(file);
  };

  // Camera functions
  const openCameraModal = () => {
    setShowCameraModal(true);
    startCamera();
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        mediaStreamRef.current = stream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setMessage(`Failed to access camera: ${err.message}. Please ensure camera permissions are granted.`);
      setShowCameraModal(false);
    }
  };

  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (!context) {
        setMessage('Failed to get canvas context.');
        return;
      }

      // Set canvas dimensions to match video feed
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw the current video frame onto the canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = canvas.toDataURL('image/jpeg', 0.9);
      const base64Data = imageData.split(',')[1];
      const mimeType = 'image/jpeg';

      if (base64Data) {
        processImageData(base64Data, mimeType);
      } else {
        setMessage('Failed to capture image from camera.');
        setLoading(false);
      }
    }
  };

  const handleDownloadCSV = () => {
    if (companies.length === 0) {
      setMessage('No data to download.');
      return;
    }

    const headers = ["Company Name", "Contact Person", "Phone Number", "Email", "Website", "Address"];
    const csvRows: string[] = [];

    csvRows.push(headers.join(','));

    companies.forEach(company => {
      const row = [
        `"${(company.companyName || '').replace(/"/g, '""')}"`,
        `"${(company.contactPerson || '').replace(/"/g, '""')}"`,
        `"${(company.phoneNumber || '').replace(/"/g, '""')}"`,
        `"${(company.email || '').replace(/"/g, '""')}"`,
        `"${(company.website || '').replace(/"/g, '""')}"`,
        `"${(company.address || '').replace(/"/g, '""')}"`
      ];
      csvRows.push(row.join(','));
    });

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'company_cards.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setMessage('CSV file downloaded!');
  };

  const handleSelectCompany = (company) => {
    setSelectedCompany(company);
  };

  const handleDeleteClick = (company) => {
    setCompanyToDelete(company);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (companyToDelete && db) {
      try {
        setLoading(true);
        await deleteDoc(doc(db, `artifacts/${appId}/public/data/companyCards`, companyToDelete.id));
        setMessage('Company card deleted successfully!');
        setSelectedCompany(null);
        setCompanyToDelete(null);
      } catch (error) {
        console.error("Error deleting document:", error);
        setMessage(`Error deleting card: ${error.message}`);
      } finally {
        setLoading(false);
        setShowDeleteConfirm(false);
      }
    }
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setCompanyToDelete(null);
  };

  const handleEditClick = (company) => {
    setEditFormData({ ...company });
    setShowEditModal(true);
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleEditSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (db && editFormData.id) {
      try {
        setLoading(true);
        const docRef = doc(db, `artifacts/${appId}/public/data/companyCards`, editFormData.id);
        await updateDoc(docRef, {
          companyName: editFormData.companyName,
          contactPerson: editFormData.contactPerson,
          phoneNumber: editFormData.phoneNumber,
          email: editFormData.email,
          website: editFormData.website,
          address: editFormData.address,
        });
        setMessage('Company card updated successfully!');
        setSelectedCompany(editFormData as CompanyData);
      } catch (error) {
        console.error("Error updating document:", error);
        setMessage(`Error updating card: ${error.message}`);
      } finally {
        setLoading(false);
        setShowEditModal(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 p-4 font-sans text-gray-800 flex flex-col items-center">
      <header className="w-full max-w-4xl text-center py-8">
        <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-indigo-700 mb-2 rounded-lg">
          CardVault
        </h1>
        <p className="text-lg text-gray-600">Your Digital Rolodex for Company Cards</p>
        {userId && (
          <p className="text-sm text-gray-500 mt-2">
            User ID: <span className="font-mono bg-gray-200 px-2 py-1 rounded-md">{userId}</span>
          </p>
        )}
      </header>

      <main className="w-full max-w-4xl bg-white rounded-xl shadow-2xl p-6 md:p-8 flex flex-col gap-6">
        {/* Upload Section */}
        <section className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center shadow-inner">
          <h2 className="text-2xl font-semibold text-blue-800 mb-4">Upload a Company Card</h2>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <label htmlFor="file-upload" className="cursor-pointer inline-block bg-blue-600 text-white py-3 px-6 rounded-full font-bold text-lg shadow-lg hover:bg-blue-700 transition duration-300 ease-in-out transform hover:scale-105">
              Choose Image
            </label>
            <input
              id="file-upload"
              type="file"
              accept="image/*"
              onChange={handleFileInputChange}
              ref={fileInputRef}
              className="hidden"
            />
            <button
              onClick={openCameraModal}
              className="inline-block bg-green-600 text-white py-3 px-6 rounded-full font-bold text-lg shadow-lg hover:bg-green-700 transition duration-300 ease-in-out transform hover:scale-105"
            >
              Take Picture
            </button>
          </div>

          {loading && (
            <div className="mt-4 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <p className="ml-3 text-blue-700 font-medium">{message}</p>
            </div>
          )}
          {!loading && message && (
            <p className="mt-4 text-sm text-gray-700">{message}</p>
          )}
        </section>

        {/* Company List and Details */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Company List */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 shadow-inner overflow-hidden">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex justify-between items-center">
              All Companies
              <button
                onClick={handleDownloadCSV}
                className="btn-primary text-white py-2 px-4 rounded-full text-sm font-semibold flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                Download CSV
              </button>
            </h2>
            {companies.length === 0 ? (
              <p className="text-gray-500 italic">No company cards uploaded yet.</p>
            ) : (
              <ul className="space-y-3 max-h-96 overflow-y-auto pr-2">
                {companies.map(company => (
                  <li
                    key={company.id}
                    className={`p-4 rounded-lg cursor-pointer transition duration-200 ease-in-out transform hover:scale-[1.01]
                                ${selectedCompany && selectedCompany.id === company.id ? 'bg-indigo-100 border-indigo-500 shadow-md' : 'bg-white border border-gray-200 hover:bg-gray-100'}`}
                    onClick={() => handleSelectCompany(company)}
                  >
                    <h3 className="text-lg font-semibold text-gray-900">{company.companyName || 'N/A'}</h3>
                    <p className="text-sm text-gray-600">{company.contactPerson || 'No Contact'}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Company Details */}
          <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-inner">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">Company Details</h2>
            {selectedCompany ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Company Name:</p>
                  <p className="text-lg font-bold text-gray-900">{selectedCompany.companyName || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Contact Person:</p>
                  <p className="text-lg text-gray-800">{selectedCompany.contactPerson || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Phone Number:</p>
                  <p className="text-lg text-gray-800">{selectedCompany.phoneNumber || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Email:</p>
                  <p className="text-lg text-gray-800">{selectedCompany.email || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Website:</p>
                  <p className="text-lg text-gray-800">{selectedCompany.website || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Address:</p>
                  <p className="text-lg text-gray-800">{selectedCompany.address || 'N/A'}</p>
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => handleEditClick(selectedCompany)}
                    className="btn-secondary py-2 px-4 rounded-full font-semibold text-sm shadow-md flex items-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M13.586 3.586a2 2 0 112.828 2.828l-7.793 7.793A2 2 0 017.07 14.92l-2.121.354a1 1 0 00-1.06 1.06l-.354 2.121a2 2 0 01-1.414 1.414l-7.793-7.793a2 2 0 01-2.828-2.828l7.793-7.793a2 2 0 012.828 0z" />
                    </svg>
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteClick(selectedCompany)}
                    className="btn-danger text-white py-2 px-4 rounded-full font-semibold text-sm shadow-md flex items-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm.002 6.75l1.5-3.5L10 14l1.5-3.5L13 14h-2.5l-1.5-3.5-1.5 3.5H7.002z" clipRule="evenodd" />
                    </svg>
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 italic">Select a company from the list to view its details.</p>
            )}
          </div>
        </section>
      </main>

      {/* Camera Modal */}
      {showCameraModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 modal-overlay p-4">
          <div className="bg-white p-6 rounded-xl shadow-2xl max-w-xl w-full text-center flex flex-col gap-4">
            <h3 className="text-2xl font-semibold text-gray-800 mb-4">Take a Picture of the Card</h3>
            <div className="camera-feed-container">
              <video ref={videoRef} autoPlay playsInline className="rounded-lg"></video>
              <canvas ref={canvasRef} className="hidden"></canvas>
            </div>
            <div className="flex justify-center gap-4 mt-4">
              <button
                onClick={capturePhoto}
                className="btn-primary text-white py-3 px-6 rounded-full font-bold text-lg shadow-lg hover:bg-purple-700 transition duration-300 ease-in-out transform hover:scale-105"
              >
                Capture Photo
              </button>
              <button
                onClick={() => { setShowCameraModal(false); stopCamera(); }}
                className="btn-secondary py-3 px-6 rounded-full font-bold text-lg shadow-lg hover:bg-gray-300 transition duration-300 ease-in-out transform hover:scale-105"
              >
                Cancel
              </button>
            </div>
            <p className="text-sm text-gray-600 mt-2">Ensure the card is well-lit and fills the frame for best results.</p>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 flex items-center justify-center z-50 modal-overlay">
          <div className="bg-white p-8 rounded-lg shadow-xl max-w-sm w-full text-center">
            <h3 className="text-xl font-semibold text-red-600 mb-4">Confirm Deletion</h3>
            <p className="text-gray-700 mb-6">Are you sure you want to delete the card for "{companyToDelete?.companyName || 'this company'}"?</p>
            <div className="flex justify-center gap-4">
              <button
                onClick={confirmDelete}
                className="btn-danger text-white py-2 px-5 rounded-full font-semibold"
              >
                Delete
              </button>
              <button
                onClick={cancelDelete}
                className="btn-secondary py-2 px-5 rounded-full font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 modal-overlay">
          <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full">
            <h3 className="text-2xl font-semibold text-gray-800 mb-6">Edit Company Card</h3>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label htmlFor="companyName" className="block text-sm font-medium text-gray-700">Company Name</label>
                <input
                  type="text"
                  id="companyName"
                  name="companyName"
                  value={editFormData.companyName || ''}
                  onChange={handleEditChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label htmlFor="contactPerson" className="block text-sm font-medium text-gray-700">Contact Person</label>
                <input
                  type="text"
                  id="contactPerson"
                  name="contactPerson"
                  value={editFormData.contactPerson || ''}
                  onChange={handleEditChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700">Phone Number</label>
                <input
                  type="text"
                  id="phoneNumber"
                  name="phoneNumber"
                  value={editFormData.phoneNumber || ''}
                  onChange={handleEditChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={editFormData.email || ''}
                  onChange={handleEditChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label htmlFor="website" className="block text-sm font-medium text-gray-700">Website</label>
                <input
                  type="url"
                  id="website"
                  name="website"
                  value={editFormData.website || ''}
                  onChange={handleEditChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label htmlFor="address" className="block text-sm font-medium text-gray-700">Address</label>
                <textarea
                  id="address"
                  name="address"
                  value={editFormData.address || ''}
                  onChange={handleEditChange}
                  rows={3}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500"
                ></textarea>
              </div>
              <div className="flex justify-end gap-4 pt-4">
                <button
                  type="submit"
                  className="btn-primary text-white py-2 px-5 rounded-full font-semibold"
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="btn-secondary py-2 px-5 rounded-full font-semibold"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
