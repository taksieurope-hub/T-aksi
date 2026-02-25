import React, { useState } from 'react';

export default function DisputeManager() {
  const [formData, setFormData] = useState({ driver_id: '', rider_id: '', amount: '', reason: 'Fraudulent charge' });
  const [status, setStatus] = useState(null);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleRefund = async (e) => {
    e.preventDefault();
    setStatus({ type: 'loading', msg: 'Processing penalty/refund...' });
    try {
      const res = await fetch('https://t-aksi.onrender.com/api/admin/dispute/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driver_id: formData.driver_id.trim(),
          rider_id: formData.rider_id.trim(),
          amount: parseFloat(formData.amount),
          reason: formData.reason
        })
      });
      const data = await res.json();
      if (res.ok) {
        setStatus({ type: 'success', msg: `✅ Success: Deducted ₾${formData.amount}` });
        setFormData({ driver_id: '', rider_id: '', amount: '', reason: '' });
      } else {
        setStatus({ type: 'error', msg: `❌ Error: ${data.detail || 'Failed'}` });
      }
    } catch (err) {
      setStatus({ type: 'error', msg: '❌ Network error.' });
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-md border-t-4 border-red-500 my-8 max-w-2xl">
      <h2 className="text-xl font-bold text-red-600 mb-2">⚖️ Driver Penalty & Refund</h2>
      <p className="text-gray-600 mb-4 text-sm">Forcefully deduct funds from a driver's virtual wallet and credit the client.</p>
      <form onSubmit={handleRefund} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <input type="text" name="driver_id" required value={formData.driver_id} onChange={handleChange} className="p-2 border rounded" placeholder="Driver ID (Firestore)" />
          <input type="text" name="rider_id" required value={formData.rider_id} onChange={handleChange} className="p-2 border rounded" placeholder="Rider ID (Firestore)" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <input type="number" name="amount" step="0.01" min="0.01" required value={formData.amount} onChange={handleChange} className="p-2 border rounded" placeholder="Amount (₾)" />
          <input type="text" name="reason" required value={formData.reason} onChange={handleChange} className="p-2 border rounded" />
        </div>
        <button type="submit" disabled={status?.type === 'loading'} className="w-full bg-red-600 text-white font-bold py-2 rounded hover:bg-red-700 disabled:bg-gray-400">
          {status?.type === 'loading' ? 'Executing...' : 'Execute Penalty'}
        </button>
      </form>
      {status && <div className="mt-4 p-3 rounded text-sm font-medium bg-gray-100">{status.msg}</div>}
    </div>
  );
}
