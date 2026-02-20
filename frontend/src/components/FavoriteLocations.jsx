// FavoriteLocations.jsx - Saved Places Component
import React, { useState, useEffect } from "react";
import { Home, Briefcase, Star, MapPin, Plus, Trash2, Heart, Building, Dumbbell, Coffee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import api from "@/api";
import { toast } from "sonner";
import { useLanguage } from "@/i18n/LanguageContext";

const ICON_OPTIONS = [
  { id: "home", icon: Home, label: "Home", color: "text-blue-400" },
  { id: "work", icon: Briefcase, label: "Work", color: "text-purple-400" },
  { id: "gym", icon: Dumbbell, label: "Gym", color: "text-orange-400" },
  { id: "cafe", icon: Coffee, label: "Café", color: "text-amber-400" },
  { id: "favorite", icon: Heart, label: "Favorite", color: "text-pink-400" },
  { id: "star", icon: Star, label: "Other", color: "text-yellow-400" }
];

const FavoriteLocations = ({ onSelectLocation }) => {
  const { t } = useLanguage();
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newFavorite, setNewFavorite] = useState({
    name: "",
    address: "",
    lat: 0,
    lng: 0,
    icon: "star"
  });

  useEffect(() => {
    fetchFavorites();
  }, []);

  const fetchFavorites = async () => {
    try {
      const res = await api.get("/user/favorites");
      setFavorites(res.data.favorites || []);
    } catch (error) {
      console.error("Failed to fetch favorites:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddFavorite = async () => {
    if (!newFavorite.name || !newFavorite.address) {
      toast.error(t('fill_all_fields') || "Please fill all fields");
      return;
    }

    try {
      // Geocode the address
      if (window.google) {
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ address: newFavorite.address }, async (results, status) => {
          if (status === "OK" && results[0]) {
            const location = results[0].geometry.location;
            const favData = {
              ...newFavorite,
              lat: location.lat(),
              lng: location.lng()
            };

            await api.post("/user/favorites", favData);
            toast.success(t('favorite_added') || "Location saved!");
            setShowAddModal(false);
            setNewFavorite({ name: "", address: "", lat: 0, lng: 0, icon: "star" });
            fetchFavorites();
          } else {
            toast.error(t('address_not_found') || "Address not found");
          }
        });
      }
    } catch (error) {
      toast.error("Failed to save location");
    }
  };

  const handleDeleteFavorite = async (id) => {
    try {
      await api.delete(`/user/favorites/${id}`);
      setFavorites(prev => prev.filter(f => f.id !== id));
      toast.success(t('favorite_deleted') || "Location removed");
    } catch (error) {
      toast.error("Failed to delete");
    }
  };

  const getIconComponent = (iconId) => {
    const option = ICON_OPTIONS.find(o => o.id === iconId) || ICON_OPTIONS[5];
    const IconComponent = option.icon;
    return <IconComponent className={`w-5 h-5 ${option.color}`} />;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {t('saved_places') || "Saved Places"}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAddModal(true)}
          className="text-primary hover:text-primary/80"
          data-testid="add-favorite-btn"
        >
          <Plus className="w-4 h-4 mr-1" />
          {t('add') || "Add"}
        </Button>
      </div>

      {favorites.length === 0 ? (
        <Card className="p-4 bg-background-secondary border-border text-center">
          <MapPin className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {t('no_saved_places') || "No saved places yet"}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {favorites.map((fav) => (
            <Card
              key={fav.id}
              className="p-3 bg-background-secondary border-border hover:border-primary/50 cursor-pointer transition-colors group relative"
              onClick={() => onSelectLocation?.({
                address: fav.address,
                lat: fav.lat,
                lng: fav.lng
              })}
              data-testid={`favorite-${fav.id}`}
            >
              <div className="flex items-center gap-2">
                {getIconComponent(fav.icon)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{fav.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{fav.address}</p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteFavorite(fav.id);
                }}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/20 rounded"
              >
                <Trash2 className="w-3 h-3 text-destructive" />
              </button>
            </Card>
          ))}
        </div>
      )}

      {/* Add Favorite Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="glass-heavy border-primary/30 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-primary">
              {t('add_favorite') || "Add Saved Place"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">{t('name') || "Name"}</label>
              <Input
                placeholder="Home, Work, Gym..."
                value={newFavorite.name}
                onChange={(e) => setNewFavorite({ ...newFavorite, name: e.target.value })}
                className="bg-background-secondary border-border text-white"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">{t('address') || "Address"}</label>
              <Input
                placeholder="Enter full address"
                value={newFavorite.address}
                onChange={(e) => setNewFavorite({ ...newFavorite, address: e.target.value })}
                className="bg-background-secondary border-border text-white"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">{t('icon') || "Icon"}</label>
              <div className="flex gap-2 flex-wrap">
                {ICON_OPTIONS.map((option) => {
                  const IconComp = option.icon;
                  return (
                    <button
                      key={option.id}
                      onClick={() => setNewFavorite({ ...newFavorite, icon: option.id })}
                      className={`p-2 rounded-lg border transition-colors ${
                        newFavorite.icon === option.id
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-muted-foreground"
                      }`}
                    >
                      <IconComp className={`w-5 h-5 ${option.color}`} />
                    </button>
                  );
                })}
              </div>
            </div>

            <Button
              onClick={handleAddFavorite}
              className="w-full bg-gradient-to-r from-primary to-secondary text-black font-bold"
            >
              {t('save_place') || "Save Place"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FavoriteLocations;
