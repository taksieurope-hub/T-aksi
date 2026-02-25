import React, { useState } from 'react';

export default function DriverWithdrawal({ driverId, currentBalance }) {
  const [formData, setFormData] = useState({ amount: '', bank_details: '' });
  const [status, setStatus] = useState(null);

  const maxWithdrawal = Math.max(0, currentBalance - 6.0).toFixed(2);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleWithdraw = async (e) => {
    e.preventDefault();
    setStatus({ type: 'loading', msg: 'Submitting request...' });
    
    try {
      const res = await fetch('https://t-aksi.onrender.com/api/driver/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driver_id: driverId,
          amount: parseFloat(formData.amount),
          bank_details: formData.bank_details
        })
      });
      const data = await res.json();
      
      if (res.ok) {
        setStatus({ type: 'success', msg: data.message });
        setFormData({ amount: '', bank_details: '' });
      } else {
        setStatus({ type: 'error', msg: `❌ ${data.detail}` });
      }
    } catch (err) {
      setStatus({ type: 'error', msg: '❌ Network error.' });
    }
  };

  return (
    <div className="p-6 bg-black/60 rounded-lg shadow-md border-t-4 border-[#00d4ff] my-4 max-w-md">
      <h2 className="text-xl font-bold text-[#00d4ff] mb-2">💸 Request Withdrawal</h2>
      
      <div className="bg-[#00d4ff]/10 text-[#00d4ff] p-3 rounded text-sm mb-4">
        <ul className="list-disc pl-5">
          <li><strong>Fee:</strong> ₾1.00 per withdrawal</li>
          <li><strong>Reserve:</strong> You must maintain a ₾5.00 minimum balance</li>
          <li><strong>Available to withdraw:</strong> ₾{maxWithdrawal}</li>
        </ul>
      </div>

      <form onSubmit={handleWithdraw} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300">Amount (₾)</label>
          <input type="number" name="amount" step="0.01" max={maxWithdrawal} required 
                 value={formData.amount} onChange={handleChange} 
                 className="mt-1 p-2 w-full border border-[#00d4ff]/30 bg-black/50 text-white rounded" placeholder="0.00" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300">Bank Details (IBAN / Card No.)</label>
          <input type="text" name="bank_details" required 
                 value={formData.bank_details} onChange={handleChange} 
                 className="mt-1 p-2 w-full border border-[#00d4ff]/30 bg-black/50 text-white rounded" placeholder="GE..." />
        </div>
        <button type="submit" disabled={status?.type === 'loading' || maxWithdrawal <= 0} 
                className="w-full bg-blue-600 text-white font-bold py-2 rounded hover:bg-blue-700 disabled:bg-gray-400">
          {status?.type === 'loading' ? 'Submitting...' : 'Submit Request'}
        </button>
      </form>
      
      {status && <div className={`mt-4 p-3 rounded text-sm font-medium ${status.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{status.msg}</div>}
    </div>
  );
}

