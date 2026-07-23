import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import {
  Package, PackageCheck, AlertTriangle, Plus, Search, RefreshCw,
  Barcode, DollarSign, Layers, MapPin, CheckCircle2, ArrowUpRight, ArrowDownLeft
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
  const [activeTab, setActiveTab] = useState("catalog");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [alerts, setAlerts] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  // New Item Modal
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({
    item_name: "", category_name: "IT Hardware", sku_barcode: "",
    total_quantity: 1, min_reorder_threshold: 5, unit_price: 0, room_location: "Main Store Room A"
  });

  // Issue Stock Modal
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueData, setIssueData] = useState({
    item_id: "", transaction_type: "issue", quantity: 1, issued_to: "", department: "Science Lab", notes: ""
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
      toast.success("Asset added to inventory");
      setShowAddItem(false);
      setNewItem({ item_name: "", category_name: "IT Hardware", sku_barcode: "", total_quantity: 1, min_reorder_threshold: 5, unit_price: 0, room_location: "Main Store Room A" });
      loadInventory();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to add inventory item");
    }
  };

  const handleStockTransaction = async () => {
    if (!issueData.item_id || !issueData.quantity) {
      toast.error("Select item and quantity");
      return;
    }
    try {
      await apiClient.post("/inventory/transactions", issueData);
      toast.success(`Stock ${issueData.transaction_type} processed successfully`);
      setShowIssueModal(false);
      loadInventory();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to process stock transaction");
    }
  };

  const totalAssetsCount = items.reduce((acc, i) => acc + (i.total_quantity || 0), 0);
  const lowStockCount = alerts.length;
  const categories = Array.from(new Set(["IT Hardware", "Science Lab", "Furniture", "Sports Gear", "Stationery", ...items.map(i => i.category_name)]));

  return (
    <div className="space-y-6 text-zinc-100">
      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-zinc-950 border-zinc-800/50 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg border border-cyan-500/30 bg-cyan-500/5 text-cyan-400">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Asset SKUs</p>
              <p className="text-xl font-bold text-white mt-0.5">{items.length}</p>
            </div>
          </div>
        </Card>

        <Card className="bg-zinc-950 border-zinc-800/50 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg border border-violet-500/30 bg-violet-500/5 text-violet-400">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Total Quantity</p>
              <p className="text-xl font-bold text-white mt-0.5">{totalAssetsCount}</p>
            </div>
          </div>
        </Card>

        <Card className="bg-zinc-950 border-zinc-800/50 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-emerald-400">
              <PackageCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">In Stock</p>
              <p className="text-xl font-bold text-emerald-400 mt-0.5">{items.reduce((acc, i) => acc + (i.available_quantity || 0), 0)}</p>
            </div>
          </div>
        </Card>

        <Card className="bg-zinc-950 border-zinc-800/50 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 text-amber-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Low Stock Reorders</p>
              <p className="text-xl font-bold text-amber-400 mt-0.5">{lowStockCount}</p>
            </div>
          </div>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <TabsList className="bg-zinc-900 border border-zinc-800">
            <TabsTrigger value="catalog" className="data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400">
              <Package className="h-4 w-4 mr-2" /> Asset Catalog
            </TabsTrigger>
            <TabsTrigger value="alerts" className="data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-400">
              <AlertTriangle className="h-4 w-4 mr-2" /> Reorder Alerts ({lowStockCount})
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input placeholder="Search SKU, Item Name..." value={search} onChange={e => setSearch(e.target.value)}
                className="pl-9 w-64 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 focus-visible:ring-cyan-500/30" />
            </div>
            <Button variant="outline" onClick={loadInventory} className="border-zinc-800 bg-zinc-950/60 text-zinc-200">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* ─── Catalog Tab ───────────────────────────────── */}
        <TabsContent value="catalog">
          <Card className="bg-zinc-950 border-zinc-800/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                <Package className="h-5 w-5 text-cyan-400" /> School Asset Master Catalog
              </CardTitle>
              <div className="flex gap-2">
                <Button onClick={() => setShowIssueModal(true)} variant="outline" className="border-zinc-700 text-zinc-200">
                  <ArrowUpRight className="h-4 w-4 mr-2 text-violet-400" /> Issue / Restock Desk
                </Button>
                <Button onClick={() => setShowAddItem(true)} className="bg-gradient-to-r from-cyan-500 to-cyan-600 text-zinc-950 font-bold">
                  <Plus className="h-4 w-4 mr-2" /> Register New Asset
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800">
                    <TableHead className="text-zinc-400">SKU / Barcode</TableHead>
                    <TableHead className="text-zinc-400">Item Name</TableHead>
                    <TableHead className="text-zinc-400">Category</TableHead>
                    <TableHead className="text-zinc-400">Location</TableHead>
                    <TableHead className="text-zinc-400">Availability</TableHead>
                    <TableHead className="text-zinc-400 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow className="border-zinc-800">
                      <TableCell colSpan={6} className="text-center text-zinc-500 py-12">
                        <Package className="h-10 w-10 mx-auto mb-3 text-zinc-700" />
                        <p className="text-sm">No asset records registered in inventory catalog</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.filter(i => !search || i.item_name.toLowerCase().includes(search.toLowerCase()) || (i.sku_barcode && i.sku_barcode.toLowerCase().includes(search.toLowerCase()))).map(item => (
                      <TableRow key={item.id} className="border-zinc-800 hover:bg-zinc-900/50">
                        <TableCell className="font-mono text-xs font-bold text-cyan-400">{item.sku_barcode || "—"}</TableCell>
                        <TableCell className="font-semibold text-white">{item.item_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-300">{item.category_name}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-zinc-400 font-mono">{item.room_location || "Store Room"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${
                            item.available_quantity <= item.min_reorder_threshold
                              ? "border-amber-500/30 text-amber-400 bg-amber-500/5"
                              : "border-emerald-500/30 text-emerald-400 bg-emerald-500/5"
                          }`}>
                            {item.available_quantity} / {item.total_quantity} available
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => { setIssueData(p => ({ ...p, item_id: item.id })); setShowIssueModal(true); }}
                            className="h-7 text-[10px] font-bold border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10">
                            Process Stock
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Reorder Alerts Tab ─────────────────────────── */}
        <TabsContent value="alerts">
          <Card className="bg-zinc-950 border-zinc-800/50">
            <CardHeader>
              <CardTitle className="text-lg font-bold text-amber-400 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-400" /> Critical Stock Reorder Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              {alerts.length === 0 ? (
                <div className="text-center py-12 text-zinc-500">
                  <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-emerald-500" />
                  <p className="text-sm">All inventory asset stock levels are healthy</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800">
                      <TableHead className="text-zinc-400">Item Name</TableHead>
                      <TableHead className="text-zinc-400">Category</TableHead>
                      <TableHead className="text-zinc-400">Current Stock</TableHead>
                      <TableHead className="text-zinc-400">Reorder Threshold</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alerts.map(a => (
                      <TableRow key={a.id} className="border-zinc-800">
                        <TableCell className="font-semibold text-white">{a.item_name}</TableCell>
                        <TableCell className="text-xs text-zinc-300">{a.category_name}</TableCell>
                        <TableCell className="font-mono text-xs font-bold text-amber-400">{a.available_quantity} remaining</TableCell>
                        <TableCell className="font-mono text-xs text-zinc-400">Threshold: {a.min_reorder_threshold}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Item Modal */}
      <Dialog open={showAddItem} onOpenChange={setShowAddItem}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Register Asset Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-3">
            <div>
              <Label className="text-zinc-400 text-xs">Asset Item Name</Label>
              <Input value={newItem.item_name} onChange={e => setNewItem(p => ({ ...p, item_name: e.target.value }))}
                className="bg-zinc-900 border-zinc-800 text-white" placeholder="Dell Optiplex i7 Desktop" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-400 text-xs">Category</Label>
                <Select value={newItem.category_name} onValueChange={v => setNewItem(p => ({ ...p, category_name: v }))}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">SKU / Barcode</Label>
                <Input value={newItem.sku_barcode} onChange={e => setNewItem(p => ({ ...p, sku_barcode: e.target.value }))}
                  className="bg-zinc-900 border-zinc-800 text-white" placeholder="IT-DESK-092" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-400 text-xs">Total Quantity</Label>
                <Input type="number" value={newItem.total_quantity} onChange={e => setNewItem(p => ({ ...p, total_quantity: parseInt(e.target.value) || 1 }))}
                  className="bg-zinc-900 border-zinc-800 text-white" />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">Min Reorder Threshold</Label>
                <Input type="number" value={newItem.min_reorder_threshold} onChange={e => setNewItem(p => ({ ...p, min_reorder_threshold: parseInt(e.target.value) || 5 }))}
                  className="bg-zinc-900 border-zinc-800 text-white" />
              </div>
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">Room / Store Location</Label>
              <Input value={newItem.room_location} onChange={e => setNewItem(p => ({ ...p, room_location: e.target.value }))}
                className="bg-zinc-900 border-zinc-800 text-white" placeholder="Computer Lab 2 / Store Room" />
            </div>
            <Button onClick={handleAddItem} className="w-full bg-gradient-to-r from-cyan-500 to-cyan-600 text-zinc-950 font-bold mt-2">
              Save Asset to Inventory
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Process Stock Modal */}
      <Dialog open={showIssueModal} onOpenChange={setShowIssueModal}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Stock Issue / Restock Counter</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-3">
            <div>
              <Label className="text-zinc-400 text-xs">Select Inventory Item</Label>
              <Select value={issueData.item_id} onValueChange={v => setIssueData(p => ({ ...p, item_id: v }))}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white">
                  <SelectValue placeholder="Choose asset SKU" />
                </SelectTrigger>
                <SelectContent>
                  {items.map(i => (
                    <SelectItem key={i.id} value={i.id}>{i.item_name} ({i.available_quantity} available)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-400 text-xs">Action Type</Label>
                <Select value={issueData.transaction_type} onValueChange={v => setIssueData(p => ({ ...p, transaction_type: v }))}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="issue">Issue to Dept</SelectItem>
                    <SelectItem value="return">Return to Store</SelectItem>
                    <SelectItem value="restock">Restock Purchase</SelectItem>
                    <SelectItem value="writeoff">Damaged / Write-off</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">Quantity</Label>
                <Input type="number" value={issueData.quantity} onChange={e => setIssueData(p => ({ ...p, quantity: parseInt(e.target.value) || 1 }))}
                  className="bg-zinc-900 border-zinc-800 text-white" />
              </div>
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">Issued To / Dept / Person</Label>
              <Input value={issueData.issued_to} onChange={e => setIssueData(p => ({ ...p, issued_to: e.target.value }))}
                className="bg-zinc-900 border-zinc-800 text-white" placeholder="e.g., Prof. Ahmed (Physics Dept)" />
            </div>
            <Button onClick={handleStockTransaction} className="w-full bg-gradient-to-r from-violet-500 to-violet-600 text-white font-bold mt-2">
              Confirm Stock Action
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default InventoryModule;
