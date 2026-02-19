import React, { useState } from 'react';

const RatingModal = ({ isOpen, onClose, onSubmit }) => {
  const [rating, setRating] = useState(5);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-xl shadow-2xl w-11/12 max-w-sm">
        <h2 className="text-2xl font-bold mb-2 text-center text-gray-800">Rate your driver</h2>
        <p className="text-center text-gray-500 mb-6">How was your trip?</p>
        
        {/* Star Rating System */}
        <div className="flex justify-center space-x-2 mb-8">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => setRating(star)}
              className={`text-4xl transition-colors ${
                rating >= star ? 'text-yellow-400' : 'text-gray-200'
              }`}
            >
              ★
            </button>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-3">
          <button 
            onClick={onClose} 
            className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
          >
            Skip
          </button>
          <button 
            onClick={() => {
              onSubmit(rating);
              onClose();
            }} 
            className="flex-1 bg-black text-white py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
};

export default RatingModal;