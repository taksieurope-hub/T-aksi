import { useState, useEffect } from "react";
import api from "@/api";
import { Loader2, RefreshCw } from "lucide-react";
const stars = (n) => "★".repeat(n) + "☆".repeat(5 - n);
export default function AdminFeedbackPanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
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
            <tr key={item.id || i} className="border-b border-white/5 hover:bg-white/3">
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
    </div>
  );
}
