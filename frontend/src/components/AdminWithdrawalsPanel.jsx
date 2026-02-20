import React, { useState, useEffect } from 'react';
import api from '../utils/api'; // Your axios instance

const AdminWithdrawalsPanel = () => {
  const [requests, setRequests] = useState([]);

  // Fetch pending requests when the Admin opens this page
  useEffect(() => {
    const fetchRequests = async () => {
      const res = await api.get('/api/admin/withdrawals/pending');
      setRequests(res.data);
    };
    fetchRequests();
  }, []);

  const handleApprove = async (id) => {
    // Tell Python backend to mark as 'approved'
    await api.post(`/api/admin/withdrawals/${id}/approve`);
    setRequests(requests.filter(req => req.id !== id)); // Remove from screen
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Pending Driver Withdrawals</h2>
      
      {requests.map((req) => (
        <div key={req.id} className="bg-white p-4 border rounded shadow mb-3 flex justify-between">
          <div>
            <p className="font-bold">Driver ID: {req.driver_id}</p>
            <p className="text-green-600 font-bold text-xl">₾{req.amount}</p>
          </div>
          <div className="space-x-2">
            <button onClick={() => handleApprove(req.id)} className="bg-black text-white px-4 py-2 rounded">
              Approve & Pay
            </button>
            <button className="bg-red-100 text-red-600 px-4 py-2 rounded">
              Deny
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default AdminWithdrawalsPanel;