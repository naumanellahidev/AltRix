import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import {
  Package, Plus, Search, RefreshCw, AlertTriangle, ArrowUpRight, ArrowDownLeft, Boxes
} from "lucide-react";

interface InventoryItem {
  id: string;
  category_name: string;
  item_name: string;
  sku_barcode?: string;
  total_quantity: number;
  available_quantity: number;
  min_reorder_threshold: number;
  unit_price?: number;
  room_location?: string;
}

export function InventoryModule() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [alerts, setAlerts] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({
    category_name: "General", item_name: "", sku_barcode: "", total_quantity: 10, min_reorder_threshold: 5, unit_price: 500, room_location: "Main Store"
  });

  const loadInventory = async () => {
    setLoading(true);
    try {
      const [resItems, resAlerts] = await Promise.all([
        apiClient.get("/inventory/items"),
        apiClient.get("/inventory/low-stock-alerts")
      ]);
      setItems(resItems.data ?? []);
      setAlerts(resAlerts.data ?? []);
    } catch {
      setItems([]);
      setAlerts([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadInventory();
  }, []);

  const handleAddItem = async () => {
    if (!newItem.item_name) {
      toast.error("Provide item name");
      return;
    }
    try {
      await apiClient.post("/inventory/items", newItem);
      toast.success("Inventory item added");
      setShowAddItem(false);
      loadInventory();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to add inventory item");
    }
  };

  const filteredItems = items.filter(i =>
    i.item_name.toLowerCase().includes(search.toLowerCase()) ||
    i.category_name.toLowerCase().includes(search.toLowerCase()) ||
    (i.sku_barcode && i.sku_barcode.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-800 text-white rounded-2xl p-6 shadow-lg shadow-blue-500/10 border border-blue-400/20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/10 rounded-xl backdrop-blur-md border border-white/20">
              <Boxes className="h-8 w-8 text-blue-100" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">School Assets & Inventory Store</h1>
              <p className="text-blue-100 text-sm mt-0.5">Track lab equipment, stationery stock, furniture & store requisitions</p>
            </div>
          </div>
          <Button onClick={() => setShowAddItem(true)} className="bg-white text-blue-700 hover:bg-blue-50 font-semibold shadow-md">
            <Plus className="h-4 w-4 mr-2" /> Add New Asset Item
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 hover:shadow-md transition-all">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50">
              <Package className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Store Items</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">{items.length}</p>
            </div>
          </div>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 hover:shadow-md transition-all">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/50">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Low Stock Reorders</p>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">{alerts.length} Items</p>
            </div>
          </div>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 hover:shadow-md transition-all">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50">
              <ArrowDownLeft className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Store Requisitions</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">Active Desk</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <CardTitle className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-600" /> Master Asset Inventory Catalog
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input placeholder="Search Asset, Category..." value={search} onChange={e => setSearch(e.target.value)}
                className="pl-9 w-64 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 focus-visible:ring-blue-500" />
            </div>
            <Button variant="outline" onClick={loadInventory} className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {filteredItems.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Package className="h-12 w-12 mx-auto mb-3 text-slate-300" />
              <p className="font-semibold text-slate-700 dark:text-slate-300">No Asset Items Found</p>
              <p className="text-xs text-slate-500 mt-1">Click "Add New Asset Item" to track school store items.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                  <TableHead>Asset Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Available Stock</TableHead>
                  <TableHead>Unit Cost</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map(i => {
                  const isLow = i.available_quantity <= i.min_reorder_threshold;
                  return (
                    <TableRow key={i.id} className="hover:bg-blue-50/50 dark:hover:bg-slate-800/50">
                      <TableCell className="font-bold text-slate-900 dark:text-slate-100">{i.item_name}</TableCell>
                      <TableCell><Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">{i.category_name}</Badge></TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-400">{i.room_location || "Store"}</TableCell>
                      <TableCell className="font-semibold">{i.available_quantity} / {i.total_quantity}</TableCell>
                      <TableCell className="font-mono text-slate-700 dark:text-slate-300">PKR {i.unit_price?.toLocaleString() || "N/A"}</TableCell>
                      <TableCell>
                        {isLow ? (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200">Reorder Required</Badge>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">In Stock</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Modal */}
      <Dialog open={showAddItem} onOpenChange={setShowAddItem}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-blue-700 dark:text-blue-400 font-bold">Add School Asset Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Item Name</Label>
              <Input value={newItem.item_name} onChange={e => setNewItem({ ...newItem, item_name: e.target.value })} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Input value={newItem.category_name} onChange={e => setNewItem({ ...newItem, category_name: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Store Location</Label>
                <Input value={newItem.room_location} onChange={e => setNewItem({ ...newItem, room_location: e.target.value })} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Total Quantity</Label>
                <Input type="number" value={newItem.total_quantity} onChange={e => setNewItem({ ...newItem, total_quantity: parseInt(e.target.value) || 1 })} className="mt-1" />
              </div>
              <div>
                <Label>Reorder Threshold</Label>
                <Input type="number" value={newItem.min_reorder_threshold} onChange={e => setNewItem({ ...newItem, min_reorder_threshold: parseInt(e.target.value) || 1 })} className="mt-1" />
              </div>
            </div>
            <Button onClick={handleAddItem} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold">Save Inventory Item</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
