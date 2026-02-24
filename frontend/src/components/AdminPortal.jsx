import { useState, useEffect } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { auth } from "../lib/firebase";
import { useAuth } from "@/config";
import api from "@/api";
import { useLanguage } from "@/i18n/LanguageContext";
import LanguageSelector from "@/i18n/LanguageSelector";
import AdminSupportPanel from "@/components/AdminSupportPanel";
import AdminCampaignsPanel from "@/components/AdminCampaignsPanel";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import {
  Shield, Users, Car, Home, LogOut, Lock, ArrowLeft, Loader2,
  CheckCircle2, XCircle, TrendingUp,
  UserCheck, Banknote, BarChart3, PlusCircle, CreditCard, MessageSquare
} , UserMinus, Search, Wallet, Loader2 } from "lucide-react";

const ADMIN_PASSWORD = "D'Ahl-Enterprise9409145169086";

// Admin Login
const AdminLogin = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      if (password === ADMIN_PASSWORD) {
        const adminUser = {
          id: "admin_local",
          name: "System",
          surname: "Admin",
          user_type: "admin",
          cellphone: "admin_master"
        };
        
        login("master_admin_token", adminUser);
        toast.success("âš¡ Master Key Accepted. Command Center Unlocked.");
        navigate("/admin/dashboard");
      } else {
        const res = await api.post(`/auth/login`, {
          cellphone: "admin",
          password: password,
        });
        
        if (res.data.user.user_type === 'admin') {
          login(res.data.token, res.data.user);
          toast.success("Welcome to Command Center!");
          navigate("/admin/dashboard");
        } else {
          toast.error("Access Denied: User is not an admin.");
        }
      }
    } catch (error) {
      console.error("Login error", error);
      toast.error("Invalid Master Key or Credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-black">
      <Card className="w-full max-w-md bg-black/70 backdrop-blur-xl border border-purple-500/30">
        <CardHeader className="text-center relative">
          <Button
            variant="ghost"
            className="absolute left-4 top-4 text-purple-400 hover:text-white"
            onClick={() => navigate("/")}
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <div className="w-20 h-20 rounded-full bg-gradient-to-r from-purple-500 to-[#00d4ff] flex items-center justify-center mx-auto mb-4">
            <Shield className="w-10 h-10 text-white" />
          </div>
          <CardTitle className="text-2xl text-purple-400">Admin Command Center</CardTitle>
          <CardDescription className="text-[#00d4ff]/70">
            Enter the master key to access
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-purple-400">Master Key</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-purple-400/50" />
                <Input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="pl-10 bg-black/50 border-purple-500/30 text-white"
                  placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                  required
                />
              </div>
            </div>
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-purple-500 to-[#00d4ff] text-white font-bold"
              disabled={loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Shield className="w-4 h-4 mr-2" />}
              Access Command Center
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

// Admin Dashboard
const AdminDashboard = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [riders, setRiders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [pendingDrivers, setPendingDrivers] = useState([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState([]);
  const [pendingTopups, setPendingTopups] = useState([]);
  const [selectedUserForTopUp, setSelectedUserForTopUp] = useState(null);
const [topUpAmount, setTopUpAmount] = useState("");
const [topUpReason, setTopUpReason] = useState("");
const [isToppingUp, setIsToppingUp] = useState(false);
  
  // Selected user for details
  const [selectedUser, setSelectedUser] = useState(null);
  const [fundAmount, setFundAmount] = useState("");
  const [fundReason, setFundReason] = useState("");

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [dashRes, ridersRes, driversRes, pendingRes, withdrawalsRes, topupsRes] = await Promise.all([
        api.get(`/admin/dashboard`).catch(() => ({ data: {} })),
        api.get(`/admin/riders`).catch(() => ({ data: { riders: [] } })),
        api.get(`/admin/drivers`).catch(() => ({ data: { drivers: [] } })),
        api.get(`/admin/drivers/pending`).catch(() => ({ data: { pending_drivers: [] } })),
        api.get(`/admin/withdrawals/pending`).catch(() => ({ data: { pending_withdrawals: [] } })),
        api.get(`/admin/topups/pending`).catch(() => ({ data: { pending_topups: [] } }))
      ]);

      setStats(dashRes.data);
      setRiders(ridersRes.data.riders || []);
      setDrivers(driversRes.data.drivers || []);
      setPendingDrivers(pendingRes.data.pending_drivers || []);
      setPendingWithdrawals(Array.isArray(withdrawalsRes.data) ? withdrawalsRes.data : []);
      setPendingTopups(topupsRes.data.pending_topups || []);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

const handleManualTopUp = async (e) => {
  e.preventDefault();
  if (!topUpAmount || isNaN(topUpAmount) || Number(topUpAmount) <= 0) {
    return toast.error("Please enter a valid amount.");
  }

  setIsToppingUp(true);
  try {
    // Calls the existing backend route
    await api.post(`/admin/add-balance/${selectedUserForTopUp.id}`, {
      amount: parseFloat(topUpAmount),
      reason: topUpReason || "Admin manual adjustment/refund"
    });
    
    toast.success(`Successfully added â‚¾${topUpAmount} to ${selectedUserForTopUp.name}'s wallet`);
    
    // Reset and close
    setSelectedUserForTopUp(null);
    setTopUpAmount("");
    setTopUpReason("");

    fetchDashboardData();
    
    // Optional: Call your fetch functions to refresh the tables
    // fetchRiders(); 
    // fetchDrivers();
  } catch (error) {
    toast.error(error.response?.data?.detail || "Failed to add funds");
  } finally {
    setIsToppingUp(false);
  }
};

  const handleApproveDriver = async (driverId) => {
    try {
      await api.post(`/admin/drivers/${driverId}/approve`);
      toast.success("Driver approved!");
      fetchDashboardData();
    } catch (error) {
      toast.error("Failed to approve driver");
    }
  };

  const handleRejectDriver = async (driverId) => {
    try {
      await api.post(`/admin/drivers/${driverId}/reject`);
      toast.success("Driver rejected");
      fetchDashboardData();
    } catch (error) {
      toast.error("Failed to reject driver");
    }
  };

  const handleApproveTopup = async (topupId) => {
    try {
      await api.post(`/admin/topups/${topupId}/approve`);
      toast.success("Top-up approved! Balance added to driver.");
      fetchDashboardData();
    } catch (error) {
      toast.error("Failed to approve top-up");
    }
  };

  const handleRejectTopup = async (topupId) => {
    try {
      await api.post(`/admin/topups/${topupId}/reject`);
      toast.success("Top-up rejected");
      fetchDashboardData();
    } catch (error) {
      toast.error("Failed to reject top-up");
    }
  };

  const handleApproveWithdrawal = async (withdrawalId) => {
    try {
      await api.post(`/admin/withdrawals/${withdrawalId}/approve`);
      toast.success("Withdrawal approved!");
      fetchDashboardData();
    } catch (error) {
      toast.error("Failed to approve withdrawal");
    }
  };

  const handleRejectWithdrawal = async (withdrawalId) => {
    try {
      await api.post(`/admin/withdrawals/${withdrawalId}/reject`);
      toast.success("Withdrawal rejected");
      fetchDashboardData();
    } catch (error) {
      toast.error("Failed to reject withdrawal");
    }
  };

  const handleAddBalance = async () => {
    if (!selectedUser) return;
    
    const amount = parseFloat(fundAmount);
    
    // ðŸ”¥ FIX: We now allow negative numbers, just not ZERO or NaN
    if (!fundAmount || isNaN(amount) || amount === 0) {
      return toast.error("Please enter a valid amount (positive to add, negative to take).");
    }

    try {
      // Calls your existing backend route
      await api.post(`/admin/add-balance/${selectedUser.id}`, {
        amount: amount, 
        reason: fundReason || "Admin manual adjustment"
      });

      // Dynamic success message
      const actionText = amount > 0 ? "added to" : "deducted from";
      toast.success(`Successfully ${actionText} ${selectedUser.name}: â‚¾${Math.abs(amount).toFixed(2)}`);

      // Clear the form and refresh data
      setFundAmount("");
      setFundReason("");
      fetchDashboardData();
      
    } catch (error) {
      console.error("Adjustment Error:", error);
      toast.error(error.response?.data?.detail || "Failed to adjust balance.");
    }
  };

  const fetchUserDetails = async (userId, userType) => {
    try {
      const endpoint = userType === "driver" ? `/admin/drivers/${userId}` : `/admin/riders/${userId}`;
      const res = await api.get(endpoint);
      setSelectedUser(userType === "driver" ? res.data.driver : res.data.rider);
    } catch (error) {
      toast.error("Failed to fetch user details");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <Loader2 className="w-16 h-16 animate-spin text-purple-500 mx-auto mb-4" />
          <p className="text-purple-400">Loading Command Center...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="bg-black/50 backdrop-blur-xl border-b border-purple-500/20 p-4 sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-[#00d4ff] flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-purple-400 font-semibold">Command Center</p>
              <p className="text-[#00d4ff]/60 text-sm">T'aksi Admin</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="ghost" size="icon" className="text-purple-400" onClick={() => navigate("/")}>
              <Home className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" className="text-purple-400" onClick={logout}>
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto p-4 max-w-6xl">
      <div className="p-6 space-y-6">
        <div className="flex gap-2">
          <input 
            placeholder="Search by name or phone..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-black/40 border border-[#00ff88]/30 text-white p-2 rounded"
          />
          <button onClick={handleSearch} disabled={isSearching} className="bg-[#00ff88] text-black px-4 py-2 rounded font-bold flex items-center">
            {isSearching ? "..." : "Search"}
          </button>
        </div>
        <div className="grid gap-4">
          {searchResults.map((user) => (
            <div key={user.id} className="bg-black/60 border border-white/10 text-white p-4 rounded-xl">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-bold text-lg">{user.name} {user.surname}</p>
                  <p className="text-gray-400 text-sm">{user.cellphone} • <span className="capitalize text-[#00d4ff]">{user.user_type}</span></p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs text-gray-500 uppercase">Balance</p>
                    <p className="text-[#00ff88] font-mono font-bold text-xl">GEL {(user.wallet_balance || 0).toFixed(2)}</p>
                  </div>
                  {user.user_type === 'driver' && (
                    <button className="bg-red-500/20 text-red-500 border border-red-500 px-3 py-1 rounded text-sm" onClick={() => handleDeduct(user.id, user.wallet_balance)}>
                      Deduct
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-7 bg-black/50 border border-purple-500/20 mb-6">
            <TabsTrigger value="overview" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white text-purple-400">
              <BarChart3 className="w-4 h-4 mr-2" /> Overview
            </TabsTrigger>
            <TabsTrigger value="riders" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white text-purple-400">
              <Users className="w-4 h-4 mr-2" /> Riders
            </TabsTrigger>
            <TabsTrigger value="drivers" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white text-purple-400">
              <Car className="w-4 h-4 mr-2" /> Drivers
            </TabsTrigger>
            <TabsTrigger value="approvals" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white text-purple-400">
              <UserCheck className="w-4 h-4 mr-2" /> Approvals
              {(pendingDrivers.length + pendingTopups.length) > 0 && (
                <Badge className="ml-2 bg-[#00ff88] text-black">{pendingDrivers.length + pendingTopups.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="withdrawals" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white text-purple-400">
              <Banknote className="w-4 h-4 mr-2" /> Withdrawals
              {pendingWithdrawals.length > 0 && (
                <Badge className="ml-2 bg-[#00ff88] text-black">{pendingWithdrawals.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="campaigns" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white text-purple-400">
              <PlusCircle className="w-4 h-4 mr-2" /> Campaigns
            </TabsTrigger>
            <TabsTrigger value="support" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white text-purple-400">
              <MessageSquare className="w-4 h-4 mr-2" /> Support
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
              <Card className="bg-black/60 border border-[#00ff88]/30 p-4 text-center">
                <Users className="w-8 h-8 mx-auto text-[#00ff88] mb-2" />
                <p className="text-3xl font-bold text-white">{stats?.total_riders || 0}</p>
                <p className="text-xs text-gray-500 uppercase">Riders</p>
              </Card>
              <Card className="bg-black/60 border border-[#00d4ff]/30 p-4 text-center">
                <Car className="w-8 h-8 mx-auto text-[#00d4ff] mb-2" />
                <p className="text-3xl font-bold text-white">{stats?.total_drivers || 0}</p>
                <p className="text-xs text-gray-500 uppercase">Drivers</p>
              </Card>
              <Card className="bg-black/60 border border-yellow-500/30 p-4 text-center">
                <TrendingUp className="w-8 h-8 mx-auto text-yellow-500 mb-2" />
                <p className="text-3xl font-bold text-white">{stats?.active_rides || 0}</p>
                <p className="text-xs text-gray-500 uppercase">Active Rides</p>
              </Card>
              <Card className="bg-black/60 border border-orange-500/30 p-4 text-center">
                <UserCheck className="w-8 h-8 mx-auto text-orange-500 mb-2" />
                <p className="text-3xl font-bold text-white">{stats?.pending_driver_approvals || 0}</p>
                <p className="text-xs text-gray-500 uppercase">Pending Drivers</p>
              </Card>
              <Card className="bg-black/60 border border-purple-500/30 p-4 text-center">
                <CreditCard className="w-8 h-8 mx-auto text-purple-500 mb-2" />
                <p className="text-3xl font-bold text-white">{stats?.pending_topups || 0}</p>
                <p className="text-xs text-gray-500 uppercase">Pending Top-ups</p>
              </Card>
              <Card className="bg-black/60 border border-pink-500/30 p-4 text-center">
                <Banknote className="w-8 h-8 mx-auto text-pink-500 mb-2" />
                <p className="text-3xl font-bold text-white">{stats?.pending_withdrawals || 0}</p>
                <p className="text-xs text-gray-500 uppercase">Pending Withdrawals</p>
              </Card>
            </div>
          </TabsContent>

          {/* Riders Tab */}
          <TabsContent value="riders">
            <Card className="bg-black/60 border border-[#00ff88]/30">
              <CardHeader>
                <CardTitle className="text-[#00ff88]">All Riders ({riders.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[#00ff88]">Name</TableHead>
                        <TableHead className="text-[#00ff88]">Phone</TableHead>
                        <TableHead className="text-[#00ff88]">Wallet</TableHead>
                        <TableHead className="text-[#00ff88]">Rides</TableHead>
                        <TableHead className="text-[#00ff88]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {riders.map(rider => (
                        <TableRow key={rider.id} className="border-[#00ff88]/10">
                          <TableCell className="text-white">{rider.name} {rider.surname}</TableCell>
                          <TableCell className="text-gray-400">{rider.cellphone}</TableCell>
                          <TableCell className="text-[#00ff88] font-bold">â‚¾{rider.wallet_balance?.toFixed(2) || "0.00"}</TableCell>
                          <TableCell className="text-gray-400">{rider.total_rides || 0}</TableCell>
                          <TableCell>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-[#00ff88]/30 text-[#00ff88]"
                                  onClick={() => fetchUserDetails(rider.id, "rider")}
                                >
                                  <PlusCircle className="w-4 h-4 mr-1" /> Add Balance
                                </Button>
                              </DialogTrigger>
                              <DialogContent aria-describedby={undefined} className="bg-black border border-[#00ff88]/30">
                                <DialogHeader>
                                  <DialogTitle className="text-[#00ff88]">Add Balance to Rider</DialogTitle>
                                  {/* ðŸ”¥ ADD THIS LINE to silence the warning */}
                                  <DialogDescription className="sr-only">
                                    Specify the amount and reason to add balance to this rider.
                                  </DialogDescription>
                                </DialogHeader>
                                {selectedUser && (
                                  <div className="space-y-4">
                                    <div className="bg-black/50 p-4 rounded-xl border border-[#00ff88]/20">
                                      <p className="text-white font-semibold">{selectedUser.name} {selectedUser.surname}</p>
                                      <p className="text-gray-400 text-sm">{selectedUser.cellphone}</p>
                                      <p className="text-[#00ff88] font-bold mt-2">
                                        Current Balance: â‚¾{selectedUser.wallet_balance?.toFixed(2) || "0.00"}
                                      </p>
                                    </div>
                                    <div className="space-y-2">
                                      <Label className="text-[#00ff88]">Amount (â‚¾)</Label>
                                      <Input
                                        type="number"
                                        value={fundAmount}
                                        onChange={e => setFundAmount(e.target.value)}
                                        className="bg-black/50 border-[#00ff88]/30 text-white"
                                        placeholder="50.00"
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label className="text-[#00ff88]">Reason</Label>
                                      <Input
                                        value={fundReason}
                                        onChange={e => setFundReason(e.target.value)}
                                        className="bg-black/50 border-[#00ff88]/30 text-white"
                                        placeholder="Refund for cancelled ride"
                                      />
                                    </div>
                                    <Button
                                      className="w-full bg-[#00ff88] text-black font-bold"
                                      onClick={handleAddBalance}
                                    >
                                      Add Balance
                                    </Button>
                                  </div>
                                )}
                              </DialogContent>
                            </Dialog>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Drivers Tab */}
          <TabsContent value="drivers">
            <Card className="bg-black/60 border border-[#00d4ff]/30">
              <CardHeader>
                <CardTitle className="text-[#00d4ff]">All Drivers ({drivers.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[#00d4ff]">Name</TableHead>
                        <TableHead className="text-[#00d4ff]">Phone</TableHead>
                        <TableHead className="text-[#00d4ff]">Balance</TableHead>
                        <TableHead className="text-[#00d4ff]">Status</TableHead>
                        <TableHead className="text-[#00d4ff]">Vehicle</TableHead>
                        <TableHead className="text-[#00d4ff]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {drivers.map(driver => (
                        <TableRow key={driver.id} className="border-[#00d4ff]/10">
                          <TableCell className="text-white">{driver.name} {driver.surname}</TableCell>
                          <TableCell className="text-gray-400">{driver.cellphone}</TableCell>
                          <TableCell className="text-[#00ff88] font-bold">â‚¾{driver.earnings?.balance?.toFixed(2) || "0.00"}</TableCell>
                          <TableCell>
                            <Badge className={
  driver.registration_status === "approved" ? "bg-[#00ff88] text-black" :
  driver.registration_status?.includes("pending") ? "bg-orange-500 text-black" :
  "bg-gray-500 text-white"
}>
                              {driver.registration_status?.replace(/_/g, " ").toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-gray-400">
                          {driver.driver_info?.vehicle ? 
                            `${driver.driver_info.vehicle.car_year} ${driver.driver_info.vehicle.car_make} ${driver.driver_info.vehicle.car_model}` : 
                            "N/A"}
                        </TableCell>
                        
                        {/* ðŸ”¥ FIXED ACTION CELL: BOTH BUTTONS SIDE BY SIDE */}
                        <TableCell className="flex items-center gap-2">
                          
                          {/* QUICK APPROVE BUTTON */}
                          {driver.registration_status?.includes("pending") && (
                            <Button 
                              size="sm"
                              className="bg-[#00ff88] text-black font-bold hover:bg-[#00d4ff]" 
                              onClick={() => handleApproveDriver(driver.id)} 
                            >
                              Approve
                            </Button>
                          )}

                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-[#00d4ff]/30 text-[#00d4ff]"
                                onClick={() => fetchUserDetails(driver.id, "driver")}
                              >
                                <PlusCircle className="w-4 h-4 mr-1" /> Add Balance
                              </Button>
                            </DialogTrigger>
                            <DialogContent aria-describedby={undefined} className="bg-black border border-[#00d4ff]/30">
                              <DialogHeader>
                               <DialogTitle className ="text-[#00d4ff]">Add Balance to Driver</DialogTitle>
                               {/* ðŸ”¥ ADD THIS LINE to silence the warning */}
                               <DialogDescription className="sr-only">
                                  Specify the amount and reason to add balance to this driver.
                               </DialogDescription>
                              </DialogHeader>
                              {selectedUser && (
                                <div className="space-y-4">
                                  <div className="bg-black/50 p-4 rounded-xl border border-[#00d4ff]/20">
                                    <p className="text-white font-semibold">{selectedUser.name} {selectedUser.surname}</p>
                                    <p className="text-gray-400 text-sm">{selectedUser.cellphone}</p>
                                    <p className="text-[#00ff88] font-bold mt-2">
                                      Current Balance: â‚¾{selectedUser.earnings?.balance?.toFixed(2) || "0.00"}
                                    </p>
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-[#00d4ff]">Amount (â‚¾)</Label>
                                    <Input
                                      type="number"
                                      value={fundAmount}
                                      onChange={e => setFundAmount(e.target.value)}
                                      className="bg-black/50 border-[#00d4ff]/30 text-white"
                                      placeholder="50.00"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-[#00d4ff]">Reason</Label>
                                    <Input
                                      value={fundReason}
                                      onChange={e => setFundReason(e.target.value)}
                                      className="bg-black/50 border-[#00d4ff]/30 text-white"
                                      placeholder="Bonus payment"
                                    />
                                  </div>
                                  <Button
                                    className="w-full bg-[#00d4ff] text-black font-bold"
                                    onClick={handleAddBalance}
                                  >
                                    Add Balance
                                  </Button>
                                </div>
                              )}
                            </DialogContent>
                          </Dialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Approvals Tab */}
        <TabsContent value="approvals">
          <div className="space-y-6">
            {/* Pending Driver Approvals */}
            <Card className="bg-black/60 border border-orange-500/30">
              <CardHeader>
                <CardTitle className="text-orange-400">Pending Driver Approvals ({pendingDrivers.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {pendingDrivers.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No pending driver approvals</div>
                ) : (
                  <div className="space-y-4">
                    {pendingDrivers.map(driver => (
                      <div key={driver.id} className="bg-black/50 border border-[#00ff88]/20 rounded-xl p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-white font-semibold">{driver.name} {driver.surname}</p>
                            <p className="text-gray-400 text-sm">{driver.cellphone}</p>
                            {driver.driver_info?.vehicle && (
                              <div className="mt-2 text-sm">
                                <p className="text-[#00d4ff]">
                                  {driver.driver_info.vehicle.car_year} {driver.driver_info.vehicle.car_make} {driver.driver_info.vehicle.car_model}
                                </p>
                                <p className="text-gray-500">{driver.driver_info.vehicle.car_color} â€¢ {driver.driver_info.vehicle.license_plate}</p>
                                <Badge className="mt-1 bg-purple-500/20 text-purple-400">
                                  Tier: {driver.driver_info.vehicle_tier?.toUpperCase()}
                                </Badge>
                              </div>
                            )}
                          </div>
                          <div className="flex space-x-2">
                            <Button
                              className="bg-[#00ff88] text-black"
                              onClick={() => handleApproveDriver(driver.id)}
                            >
                              <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={() => handleRejectDriver(driver.id)}
                            >
                              <XCircle className="w-4 h-4 mr-1" /> Reject
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

              {/* Pending Top-up Requests */}
              <Card className="bg-black/60 border border-purple-500/30">
                <CardHeader>
                  <CardTitle className="text-purple-400">Pending Top-up Requests ({pendingTopups.length})</CardTitle>
                  <CardDescription className="text-gray-400">
                    Drivers who have requested to add balance to their accounts
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {pendingTopups.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">No pending top-up requests</div>
                  ) : (
                    <div className="space-y-4">
                      {pendingTopups.map(topup => (
                        <div key={topup.id} className="bg-black/50 border border-purple-500/20 rounded-xl p-4">
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="text-white font-semibold">{topup.driver_name}</p>
                              <p className="text-gray-400 text-sm">{topup.driver_cellphone}</p>
                              {topup.payment_reference && (
                                <p className="text-xs text-gray-500 mt-1">Ref: {topup.payment_reference}</p>
                              )}
                              <p className="text-xs text-gray-600">
                                Requested: {topup.requested_at ? new Date(topup.requested_at).toLocaleString() : "N/A"}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-3xl font-bold text-purple-400">â‚¾{topup.amount?.toFixed(2)}</p>
                              <div className="flex space-x-2 mt-2">
                                <Button
                                  size="sm"
                                  className="bg-[#00ff88] text-black"
                                  onClick={() => handleApproveTopup(topup.id)}
                                >
                                  <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleRejectTopup(topup.id)}
                                >
                                  <XCircle className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Withdrawals Tab */}
          <TabsContent value="withdrawals">
            <Card className="bg-black/60 border border-pink-500/30">
              <CardHeader>
                <CardTitle className="text-pink-400 flex items-center">
                  <Banknote className="mr-2 w-6 h-6" /> 
                  Pending Payouts ({pendingWithdrawals.length})
                </CardTitle>
                <CardDescription className="text-gray-400">
                  Send the GEL to the IBANs below, then mark as paid. â‚¾1.00 fee is already deducted from driver balance.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {pendingWithdrawals.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <CheckCircle2 className="w-12 h-12 mx-auto mb-2 opacity-20" />
                    <p>All drivers are paid up. Great job!</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {pendingWithdrawals.map(withdrawal => (
                      <div key={withdrawal.id} className="bg-black/50 border border-pink-500/20 rounded-2xl p-5 hover:border-pink-500/50 transition-colors">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                          
                          {/* Driver Info & Amount */}
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="text-white text-lg font-bold">{withdrawal.driver_name}</p>
                              <Badge variant="outline" className="text-[10px] border-pink-500/30 text-pink-400 uppercase">
                                ID: {withdrawal.id}
                              </Badge>
                            </div>
                            <p className="text-3xl font-black text-[#00ff88]">
                              â‚¾{withdrawal.amount_requested?.toFixed(2)}
                            </p>
                            <p className="text-[10px] text-gray-500">
                              Requested: {new Date(withdrawal.created_at).toLocaleString()}
                            </p>
                          </div>

                          {/* IBAN Copy Box */}
                          <div className="flex-1 w-full md:max-w-md">
                            <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center justify-between group">
                              <div className="overflow-hidden">
                                <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Bank Details / IBAN</p>
                                <p className="text-sm font-mono text-white truncate">{withdrawal.bank_details}</p>
                              </div>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-[#00d4ff] hover:bg-[#00d4ff]/10"
                                onClick={() => {
                                  navigator.clipboard.writeText(withdrawal.bank_details);
                                  toast.success("IBAN Copied to Clipboard!");
                                }}
                              >
                                Copy
                              </Button>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex gap-2 w-full md:w-auto">
                            <Button
                              className="flex-1 md:flex-none bg-[#00ff88] text-black font-bold h-12 px-6 hover:bg-[#00cc6a]"
                              onClick={() => handleApproveWithdrawal(withdrawal.id)}
                            >
                              <CheckCircle2 className="w-4 h-4 mr-2" /> Mark Paid
                            </Button>
                            <Button
                              variant="destructive"
                              className="h-12 w-12"
                              onClick={() => handleRejectWithdrawal(withdrawal.id)}
                            >
                              <XCircle className="w-5 h-5" />
                            </Button>
                          </div>

                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Campaigns Tab */}
          <TabsContent value="campaigns">
            <AdminCampaignsPanel />
          </TabsContent>

          {/* Support Tab */}
          <TabsContent value="support">
            <AdminSupportPanel />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

// Main Router
const AdminPortal = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery) return;
    setIsSearching(true);
    try {
      const res = await axios.get(`/admin/users/search?q=${searchQuery}`);
      setSearchResults(res.data.users || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleDeduct = async (userId, currentBalance) => {
    const amountStr = prompt(`Current Balance: GEL ${currentBalance}\nEnter amount to DEDUCT:`);
    if (!amountStr || isNaN(amountStr)) return;
    const reason = prompt("Enter reason (e.g. Fraudulent Ride #123):");
    if (!reason) return;
    try {
      await axios.post(`/admin/drivers/${userId}/wallet/deduct`, { amount: parseFloat(amountStr), reason });
      handleSearch();
    } catch (err) {
      alert("Failed to deduct funds.");
    }
  };
  const { user } = useAuth();
  const location = useLocation();

  // Redirect Logic
  if (!user || user.user_type !== "admin") {
    if (location.pathname === "/admin" || location.pathname === "/admin/") {
      return <AdminLogin />;
    }
    return <Navigate to="/admin" replace />;
  }

  // Admin Routes (Nested)
  return (
    <Routes>
      <Route path="/" element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<AdminDashboard />} />
      <Route path="*" element={<Navigate to="dashboard" replace />} />
    </Routes>
  );
};

export default AdminPortal;
