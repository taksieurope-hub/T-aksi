import { useState, useEffect } from "react";
import api from "@/api";
import { Loader2, RefreshCw } from "lucide-react";

const stars = (n) => "★".repeat(n) + "☆".repeat(5 - n);

export default function AdminFeedbackPanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null); // Added state for the modal

  const load = () => { setLoading(true); api.get("/admin/feedback").then(r => setItems(r.data.feedback || [])).catch(() => {}).finally(() => setLoading(false)); };
  
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-purple-400 font-bold text-lg">User Feedback</h2>
        <button onClick={load} className="flex items-center gap-1.5 text-gray-500 hover:text-white text-sm"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
      </div>
      
      {loading ? <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-purple-500" /></div>
      : items.length === 0 ? <div className="text-center py-16 text-gray-600">No feedback yet</div>
      : <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-b border-white/8 text-gray-500 text-xs uppercase tracking-wider">
            <th className="text-left pb-3 pr-4">User</th><th className="text-left pb-3 pr-4">Type</th><th className="text-left pb-3 pr-4">NPS</th><th className="text-left pb-3 pr-4">Stars</th><th className="text-left pb-3 pr-4">Category</th><th className="text-left pb-3 pr-4">Comment</th><th className="text-left pb-3">Date</th>
          </tr></thead>
          <tbody>{items.map((item, i) => (
            <tr 
              key={item.id || i} 
              onClick={() => setSelectedItem(item)}
              className="border-b border-white/5 hover:bg-white/10 cursor-pointer transition-colors"
            >
              <td className="py-3 pr-4 text-white/50 text-xs font-mono">{(item.user_id||"").slice(0,8)}...</td>
              <td className="py-3 pr-4"><span className={"px-2 py-0.5 rounded text-[10px] font-bold uppercase border " + (item.user_type==="driver" ? "bg-sky-500/15 text-sky-400 border-sky-500/25" : "bg-emerald-500/15 text-emerald-400 border-emerald-500/25")}>{item.user_type||"rider"}</span></td>
              <td className="py-3 pr-4"><span className={"font-bold text-base " + (item.nps>=9?"text-emerald-400":item.nps>=7?"text-amber-400":"text-red-400")}>{item.nps??"-"}</span></td>
              <td className="py-3 pr-4 text-amber-400 text-xs">{item.stars?stars(item.stars):"-"}</td>
              <td className="py-3 pr-4"><span className={"px-2 py-0.5 rounded text-[10px] font-semibold uppercase border " + (item.category==="bug"?"bg-red-500/15 text-red-400 border-red-500/25":item.category==="suggestion"?"bg-blue-500/15 text-blue-400 border-blue-500/25":"bg-pink-500/15 text-pink-400 border-pink-500/25")}>{item.category||"-"}</span></td>
              <td className="py-3 pr-4 text-white/70 max-w-xs">{item.comment?(item.comment.length>80?item.comment.slice(0,80)+"...":item.comment):<span className="text-white/20">-</span>}</td>
              <td className="py-3 text-white/30 text-xs whitespace-nowrap">{item.created_at?new Date(item.created_at).toLocaleDateString():"-"}</td>
            </tr>
          ))}</tbody>
        </table></div>}

      {/* --- FEEDBACK DETAILS MODAL --- */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-[#111] border border-white/10 rounded-2xl shadow-2xl p-6 w-full max-w-lg relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setSelectedItem(null)} className="absolute top-4 right-4 text-gray-500 hover:text-white text-xl">
              ✕
            </button>

            <h2 className="text-xl font-bold text-white mb-6 border-b border-white/10 pb-3">
              Feedback Details
            </h2>

            <div className="space-y-4 text-gray-300 text-sm">
              <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <span className="font-semibold text-white/50">User ID:</span>
                <span className="font-mono text-xs text-white/80">{selectedItem.user_id || "Anonymous"}</span>
              </div>
              
              <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <span className="font-semibold text-white/50">App Type:</span>
                <span className="uppercase text-xs font-bold text-purple-400">{selectedItem.user_type || "rider"}</span>
              </div>

              <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <span className="font-semibold text-white/50">Category:</span>
                <span className="uppercase text-xs font-bold text-blue-400">{selectedItem.category || "General"}</span>
              </div>

              <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <span className="font-semibold text-white/50">Rating:</span>
                <span className="text-amber-400 text-lg tracking-widest">{selectedItem.stars ? stars(selectedItem.stars) : "N/A"}</span>
              </div>

              <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <span className="font-semibold text-white/50">NPS Score:</span>
                <span className="font-bold text-emerald-400">{selectedItem.nps !== undefined && selectedItem.nps !== null ? `${selectedItem.nps} / 10` : "N/A"}</span>
              </div>

              <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <span className="font-semibold text-white/50">Date:</span>
                <span>{selectedItem.created_at ? new Date(selectedItem.created_at).toLocaleString() : "Unknown"}</span>
              </div>

              <div className="mt-4">
                <span className="block font-semibold text-white/50 mb-2">Full User Comment:</span>
                <div className="bg-black/50 p-4 rounded-xl border border-white/5 min-h-[100px] whitespace-pre-wrap text-white/90">
                  {selectedItem.comment || "No written comment provided."}
                </div>
              </div>
            </div>

            <button 
              onClick={() => setSelectedItem(null)}
              className="w-full mt-8 bg-white/10 hover:bg-white/20 text-white font-medium py-3 rounded-xl transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}