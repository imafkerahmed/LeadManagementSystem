"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Trash2,
  Edit,
  CheckCircle,
  Clock,
  AlertCircle,
  Calendar,
  User,
  Laptop,
  Smartphone,
  Printer,
  Package,
  ChevronLeft,
  ChevronRight,
  Info,
  History,
  Tag,
  DollarSign,
  Wrench,
  RefreshCw,
  QrCode,
  UploadCloud,
} from "lucide-react";
import { Asset, AssetType, AssetStatus, AssetHistory, User as SystemUser } from "@/types";
import { createPocketBaseClient } from "@/lib/pocketbase";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function AdminAssets() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);

  // Filters state
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [warrantyFilter, setWarrantyFilter] = useState("all");

  // Pagination state
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Form state
  const [name, setName] = useState("");
  const [type, setType] = useState<AssetType>("laptop");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [status, setStatus] = useState<AssetStatus>("available");
  const [assignedTo, setAssignedTo] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [purchaseCost, setPurchaseCost] = useState("");
  const [warrantyExpiry, setWarrantyExpiry] = useState("");
  const [notes, setNotes] = useState("");

  // Previous values to track changes for history logs
  const [prevStatus, setPrevStatus] = useState<AssetStatus | null>(null);
  const [prevAssignedTo, setPrevAssignedTo] = useState<string | null>(null);

  // Dialogs state
  const [deleteAssetId, setDeleteAssetId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [viewAsset, setViewAsset] = useState<Asset | null>(null);

  // History state
  const [history, setHistory] = useState<AssetHistory[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Scanner state
  const [showScanner, setShowScanner] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [activeDeviceIndex, setActiveDeviceIndex] = useState<number>(0);
  const scannerRef = useRef<any>(null);

  useEffect(() => {
    let html5QrCode: any = null;

    if (showScanner) {
      const timer = setTimeout(async () => {
        try {
          const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
          html5QrCode = new Html5Qrcode("qr-reader-target", {
            verbose: false,
            formatsToSupport: [
              Html5QrcodeSupportedFormats.QR_CODE,
              Html5QrcodeSupportedFormats.EAN_13,
              Html5QrcodeSupportedFormats.EAN_8,
              Html5QrcodeSupportedFormats.CODE_128,
              Html5QrcodeSupportedFormats.CODE_39,
              Html5QrcodeSupportedFormats.UPC_A,
              Html5QrcodeSupportedFormats.UPC_E
            ]
          });
          scannerRef.current = html5QrCode;

          const loadDevicesAndSync = async (activeCameraIdOrConfig: any) => {
            try {
              const list = await Html5Qrcode.getCameras();
              setDevices(list);
              if (list && list.length > 0) {
                if (typeof activeCameraIdOrConfig === "string") {
                  const idx = list.findIndex((d: any) => d.id === activeCameraIdOrConfig);
                  if (idx !== -1) {
                    setActiveDeviceIndex(idx);
                  }
                } else if (activeCameraIdOrConfig && activeCameraIdOrConfig.facingMode === "environment") {
                  const backIdx = list.findIndex((d: any) => {
                    const label = d.label.toLowerCase();
                    return label.includes("back") || label.includes("rear") || label.includes("environment");
                  });
                  if (backIdx !== -1) {
                    setActiveDeviceIndex(backIdx);
                  }
                }
              }
            } catch (e) {
              console.warn("Could not retrieve camera list for switching:", e);
            }
          };
          
          const startScanning = (cameraIdOrConfig: any) => {
            html5QrCode.start(
              cameraIdOrConfig,
              {
                fps: 15, // Higher frame rate for scanning barcodes
                qrbox: (width: number, height: number) => {
                  // Barcodes are horizontal, so we make the scanning region wider and shorter
                  const boxWidth = Math.floor(width * 0.85);
                  const boxHeight = Math.floor(height * 0.45);
                  return { width: boxWidth, height: boxHeight };
                },
                experimentalFeatures: {
                  useBarCodeDetectorIfSupported: true
                }
              },
              (decodedText: string) => {
                setSerialNumber(decodedText.trim());
                toast.success(`Code detected: ${decodedText}`);
                setShowScanner(false);
              },
              () => {
                // silent frame check errors
              }
            ).then(() => {
              // Refresh devices list once permissions are granted
              loadDevicesAndSync(cameraIdOrConfig);
            }).catch((err: any) => {
              console.error(`Camera start failed:`, err);
              if (cameraIdOrConfig && cameraIdOrConfig.facingMode === "environment") {
                // Fallback to front camera if environment camera fails
                startScanning({ facingMode: "user" });
              } else {
                toast.error("Could not access camera. Make sure permissions are granted.");
                setShowScanner(false);
              }
            });
          };

          // Try listing cameras first
          Html5Qrcode.getCameras()
            .then((list: any[]) => {
              if (list && list.length > 0) {
                setDevices(list);
                // Prioritize back camera in the list
                const backCameraIdx = list.findIndex((device) => {
                  const label = device.label.toLowerCase();
                  return (
                    label.includes("back") ||
                    label.includes("rear") ||
                    label.includes("environment") ||
                    label.includes("outline") ||
                    label.includes("facing camera 0")
                  );
                });
                
                const selectedIndex = backCameraIdx !== -1 ? backCameraIdx : 0;
                setActiveDeviceIndex(selectedIndex);
                startScanning(list[selectedIndex].id);
              } else {
                // Fallback to environment configuration
                startScanning({ facingMode: "environment" });
              }
            })
            .catch(() => {
              // Query blocked, load with facingMode environment config
              startScanning({ facingMode: "environment" });
            });

        } catch (e) {
          console.error("Failed to load html5-qrcode dynamically:", e);
          toast.error("Scanner failed to load.");
          setShowScanner(false);
        }
      }, 300);

      return () => {
        clearTimeout(timer);
        if (html5QrCode) {
          try {
            html5QrCode.stop().catch((err: any) => {
              console.log("Scanner stop error:", err);
            });
          } catch (e) {
            console.error("Error stopping scanner instance:", e);
          }
        }
        scannerRef.current = null;
        setDevices([]);
        setActiveDeviceIndex(0);
      };
    }
  }, [showScanner]);

  const handleSwitchCamera = async () => {
    if (devices.length <= 1 || !scannerRef.current) return;

    const nextIndex = (activeDeviceIndex + 1) % devices.length;
    const nextDevice = devices[nextIndex];

    try {
      if (scannerRef.current.isScanning) {
        await scannerRef.current.stop();
      }

      setActiveDeviceIndex(nextIndex);
      toast.loading("Switching camera...", { id: "camera-switch" });

      await scannerRef.current.start(
        nextDevice.id,
        {
          fps: 15,
          qrbox: (width: number, height: number) => {
            const boxWidth = Math.floor(width * 0.85);
            const boxHeight = Math.floor(height * 0.45);
            return { width: boxWidth, height: boxHeight };
          },
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true
          }
        },
        (decodedText: string) => {
          setSerialNumber(decodedText.trim());
          toast.success(`Code detected: ${decodedText}`);
          setShowScanner(false);
        },
        () => {}
      );
      
      toast.success(`Camera Active: ${nextDevice.label || `Camera ${nextIndex + 1}`}`, { id: "camera-switch" });
    } catch (err) {
      console.error("Failed to switch camera:", err);
      toast.error("Could not switch camera. Resetting scanner...", { id: "camera-switch" });
      setShowScanner(false);
      setTimeout(() => setShowScanner(true), 500);
    }
  };

  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (scannerRef.current && scannerRef.current.isScanning) {
        await scannerRef.current.stop();
      }
      
      const { Html5Qrcode } = await import("html5-qrcode");
      const fileScanner = new Html5Qrcode("qr-reader-target");
      const decodedText = await fileScanner.scanFile(file, true);
      setSerialNumber(decodedText.trim());
      toast.success(`Code detected: ${decodedText}`);
      setShowScanner(false);
    } catch (err) {
      console.error("File scanning failed:", err);
      toast.error("Could not detect barcode. Make sure the image is clear and well-lit.");
      setShowScanner(false);
      setTimeout(() => setShowScanner(true), 400);
    }
  };

  // Reset to first page when search filters change
  useEffect(() => {
    setPage(1);
  }, [searchTerm, typeFilter, statusFilter, warrantyFilter]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const pb = createPocketBaseClient();
      
      // Fetch users
      const token = pb.authStore.token;
      const fetchOptions: RequestInit = { cache: "no-store" };
      if (token) {
        fetchOptions.headers = { Authorization: `Bearer ${token}` };
      }
      const usersResponse = await fetch("/api/admin/users", fetchOptions);
      if (!usersResponse.ok) throw new Error("Failed to fetch users");
      const usersData = await usersResponse.json();
      setUsers(usersData);

      // Fetch assets
      const records = await pb.collection("assets").getFullList({
        sort: "-created",
        expand: "assignedTo",
      });

      const mappedAssets = records.map((record) => {
        const assignee = record.expand?.assignedTo as { name?: string; email?: string } | undefined;
        return {
          id: record.id,
          name: record.name,
          type: record.type as AssetType,
          brand: record.brand,
          model: record.model || "",
          serialNumber: record.serialNumber,
          status: record.status as AssetStatus,
          assignedTo: record.assignedTo || "",
          assignedToName: assignee?.name || assignee?.email || "",
          assignedAt: record.assignedAt || "",
          purchaseDate: record.purchaseDate || "",
          purchaseCost: record.purchaseCost || undefined,
          warrantyExpiry: record.warrantyExpiry || "",
          notes: record.notes || "",
          created: record.created,
          updated: record.updated,
        };
      });

      setAssets(mappedAssets);
    } catch (error) {
      console.error("Error loading asset data:", error);
      toast.error("Failed to load assets data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // Calculate stats
  const stats = useMemo(() => {
    const total = assets.length;
    const assigned = assets.filter((a) => a.status === "assigned").length;
    const available = assets.filter((a) => a.status === "available").length;
    const maintenance = assets.filter((a) => a.status === "maintenance").length;
    
    // Warranty expiring soon (within 30 days) or already expired
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    const warrantyExpiringSoon = assets.filter((a) => {
      if (!a.warrantyExpiry) return false;
      const expiry = new Date(a.warrantyExpiry);
      return expiry > now && expiry <= thirtyDaysFromNow;
    }).length;

    const warrantyExpired = assets.filter((a) => {
      if (!a.warrantyExpiry) return false;
      return new Date(a.warrantyExpiry) < now;
    }).length;

    return { total, assigned, available, maintenance, warrantyExpiringSoon, warrantyExpired };
  }, [assets]);

  // Load history for viewed asset
  useEffect(() => {
    if (!viewAsset) {
      setHistory([]);
      return;
    }

    const loadHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const pb = createPocketBaseClient();
        const records = await pb.collection("assetHistory").getFullList({
          filter: `assetId = "${viewAsset.id}"`,
          sort: "-date",
          expand: "changedBy",
        });

        const mappedHistory = records.map((record) => {
          const author = record.expand?.changedBy as { name?: string; email?: string } | undefined;
          return {
            id: record.id,
            assetId: record.assetId,
            changedBy: record.changedBy,
            changedByName: author?.name || author?.email || "Unknown Staff",
            action: record.action,
            details: record.details,
            date: record.date,
            created: record.created,
          };
        });

        setHistory(mappedHistory);
      } catch (error) {
        console.error("Error loading asset history:", error);
        toast.error("Failed to load asset history.");
      } finally {
        setIsLoadingHistory(false);
      }
    };

    void loadHistory();
  }, [viewAsset]);

  // Filter assets
  const filteredAssets = useMemo(() => {
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    return assets.filter((asset) => {
      // Search query filter
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        asset.name.toLowerCase().includes(searchLower) ||
        asset.serialNumber.toLowerCase().includes(searchLower) ||
        asset.brand.toLowerCase().includes(searchLower) ||
        (asset.model || "").toLowerCase().includes(searchLower) ||
        (asset.assignedToName || "").toLowerCase().includes(searchLower);

      // Type filter
      const matchesType = typeFilter === "all" || asset.type === typeFilter;

      // Status filter
      const matchesStatus = statusFilter === "all" || asset.status === statusFilter;

      // Warranty filter
      let matchesWarranty = true;
      if (warrantyFilter === "expired") {
        matchesWarranty = !!asset.warrantyExpiry && new Date(asset.warrantyExpiry) < now;
      } else if (warrantyFilter === "expiring_soon") {
        if (!asset.warrantyExpiry) {
          matchesWarranty = false;
        } else {
          const expiry = new Date(asset.warrantyExpiry);
          matchesWarranty = expiry > now && expiry <= thirtyDaysFromNow;
        }
      } else if (warrantyFilter === "active") {
        matchesWarranty = !asset.warrantyExpiry || new Date(asset.warrantyExpiry) >= now;
      }

      return matchesSearch && matchesType && matchesStatus && matchesWarranty;
    });
  }, [assets, searchTerm, typeFilter, statusFilter, warrantyFilter]);

  // Pagination logic
  const paginatedAssets = useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    return filteredAssets.slice(startIndex, startIndex + pageSize);
  }, [filteredAssets, page, pageSize]);

  const totalPages = Math.ceil(filteredAssets.length / pageSize) || 1;

  // Form controls
  const openCreateForm = () => {
    setName("");
    setType("laptop");
    setBrand("");
    setModel("");
    setSerialNumber("");
    setStatus("available");
    setAssignedTo("");
    setPurchaseDate("");
    setPurchaseCost("");
    setWarrantyExpiry("");
    setNotes("");
    setEditingAssetId(null);
    setPrevStatus(null);
    setPrevAssignedTo(null);
    setShowForm(true);
  };

  const openEditForm = (asset: Asset) => {
    setName(asset.name);
    setType(asset.type);
    setBrand(asset.brand);
    setModel(asset.model || "");
    setSerialNumber(asset.serialNumber);
    setStatus(asset.status);
    setAssignedTo(asset.assignedTo || "");
    setPurchaseDate(asset.purchaseDate ? asset.purchaseDate.split("T")[0] : "");
    setPurchaseCost(asset.purchaseCost ? String(asset.purchaseCost) : "");
    setWarrantyExpiry(asset.warrantyExpiry ? asset.warrantyExpiry.split("T")[0] : "");
    setNotes(asset.notes || "");
    setEditingAssetId(asset.id);
    setPrevStatus(asset.status);
    setPrevAssignedTo(asset.assignedTo || null);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !brand.trim() || !serialNumber.trim()) {
      toast.error("Please fill in all required fields.");
      return;
    }

    setIsSubmitting(true);
    try {
      const pb = createPocketBaseClient();
      const currentUser = pb.authStore.model;

      if (!currentUser) {
        toast.error("User session expired. Please sign in again.");
        return;
      }

      // Check if serial number already exists (excluding current asset)
      const existing = await pb.collection("assets").getFullList({
        filter: `serialNumber = "${serialNumber.trim()}" ${editingAssetId ? `&& id != "${editingAssetId}"` : ""}`,
      });

      if (existing.length > 0) {
        toast.error("An asset with this serial number already exists.");
        setIsSubmitting(false);
        return;
      }

      const isStatusChangedToAssigned = status === "assigned" && prevStatus !== "assigned";
      const isStatusChangedFromAssigned = status !== "assigned" && prevStatus === "assigned";
      
      const payload: Record<string, any> = {
        name: name.trim(),
        type,
        brand: brand.trim(),
        model: model.trim() || null,
        serialNumber: serialNumber.trim(),
        status,
        assignedTo: status === "assigned" && assignedTo ? assignedTo : null,
        assignedAt: status === "assigned" ? (isStatusChangedToAssigned || assignedTo !== prevAssignedTo ? new Date().toISOString() : undefined) : null,
        purchaseDate: purchaseDate ? new Date(purchaseDate).toISOString() : null,
        purchaseCost: purchaseCost ? parseFloat(purchaseCost) : null,
        warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry).toISOString() : null,
        notes: notes.trim() || null,
      };

      if (editingAssetId) {
        // Edit asset
        await pb.collection("assets").update(editingAssetId, payload);

        // Generate history logs for modifications
        const historyLogs: Array<{ action: string; details: string }> = [];

        if (prevStatus !== status) {
          historyLogs.push({
            action: "Status Update",
            details: `Status updated from "${prevStatus}" to "${status}".`,
          });
        }

        if (status === "assigned" && assignedTo !== prevAssignedTo) {
          const selectedUser = users.find((u) => u.id === assignedTo);
          const userName = selectedUser?.name || selectedUser?.email || "Unknown User";
          historyLogs.push({
            action: "Assignment",
            details: `Asset assigned to ${userName}.`,
          });
        } else if (isStatusChangedFromAssigned) {
          const prevUser = users.find((u) => u.id === prevAssignedTo);
          const prevUserName = prevUser?.name || prevUser?.email || "Unknown User";
          historyLogs.push({
            action: "Unassignment",
            details: `Asset unassigned from ${prevUserName}.`,
          });
        }

        if (historyLogs.length === 0) {
          historyLogs.push({
            action: "Update",
            details: "Asset details updated.",
          });
        }

        // Write history logs to DB
        for (const log of historyLogs) {
          await pb.collection("assetHistory").create({
            assetId: editingAssetId,
            changedBy: currentUser.id,
            action: log.action,
            details: log.details,
            date: new Date().toISOString(),
          });
        }

        toast.success("Asset updated successfully.");
      } else {
        // Create asset
        const createdAsset = await pb.collection("assets").create(payload);

        // Log creation in history
        await pb.collection("assetHistory").create({
          assetId: createdAsset.id,
          changedBy: currentUser.id,
          action: "Create",
          details: "Asset registered in system.",
          date: new Date().toISOString(),
        });

        // Log assignment if created as already assigned
        if (status === "assigned" && assignedTo) {
          const selectedUser = users.find((u) => u.id === assignedTo);
          const userName = selectedUser?.name || selectedUser?.email || "Unknown User";
          await pb.collection("assetHistory").create({
            assetId: createdAsset.id,
            changedBy: currentUser.id,
            action: "Assignment",
            details: `Asset assigned to ${userName}.`,
            date: new Date().toISOString(),
          });
        }

        toast.success("Asset registered successfully.");
      }

      setShowForm(false);
      void loadData();
    } catch (error) {
      console.error("Error saving asset:", error);
      toast.error("Failed to save asset.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteAssetId) return;

    try {
      const pb = createPocketBaseClient();
      await pb.collection("assets").delete(deleteAssetId);
      toast.success("Asset deleted successfully.");
      setDeleteAssetId(null);
      setDeleteDialogOpen(false);
      void loadData();
      if (viewAsset?.id === deleteAssetId) {
        setViewAsset(null);
      }
    } catch (error) {
      console.error("Error deleting asset:", error);
      toast.error("Failed to delete asset.");
    }
  };

  const getAssetIcon = (type: AssetType) => {
    switch (type) {
      case "laptop":
        return <Laptop className="h-4 w-4" />;
      case "phone":
        return <Smartphone className="h-4 w-4" />;
      case "printer":
        return <Printer className="h-4 w-4" />;
      case "peripheral":
        return <Tag className="h-4 w-4" />;
      default:
        return <Package className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: AssetStatus) => {
    switch (status) {
      case "available":
        return "bg-emerald-50 text-emerald-700 border-emerald-100";
      case "assigned":
        return "bg-blue-50 text-blue-700 border-blue-100";
      case "maintenance":
        return "bg-amber-50 text-amber-700 border-amber-100";
      case "retired":
        return "bg-rose-50 text-rose-700 border-rose-100";
    }
  };

  const getWarrantyStatus = (expiryDate?: string) => {
    if (!expiryDate) return { text: "No Expiry", color: "bg-slate-100 text-slate-500 border-slate-200" };
    
    const expiry = new Date(expiryDate);
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    if (expiry < now) {
      return { text: "Expired", color: "bg-rose-50 text-rose-600 border-rose-100 font-bold" };
    }
    if (expiry <= thirtyDaysFromNow) {
      return { text: "Expiring Soon", color: "bg-amber-50 text-amber-600 border-amber-100 font-bold" };
    }
    return { text: "Active", color: "bg-emerald-50 text-emerald-600 border-emerald-100" };
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "-";
    try {
      return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  };

  const formatCost = (cost?: number) => {
    if (cost === undefined || cost === null) return "-";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cost);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      {/* Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider">Total Assets</span>
            <span className="text-2xl font-black text-slate-700 mt-1 block">{stats.total}</span>
          </div>
          <div className="p-3 bg-slate-50 text-slate-500 rounded-xl"><Package className="h-5 w-5" /></div>
        </div>
        <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider">Assigned</span>
            <span className="text-2xl font-black text-blue-600 mt-1 block">{stats.assigned}</span>
          </div>
          <div className="p-3 bg-blue-50 text-blue-500 rounded-xl"><User className="h-5 w-5" /></div>
        </div>
        <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider">Available</span>
            <span className="text-2xl font-black text-emerald-600 mt-1 block">{stats.available}</span>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-500 rounded-xl"><CheckCircle className="h-5 w-5" /></div>
        </div>
        <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider">In Repair</span>
            <span className="text-2xl font-black text-amber-600 mt-1 block">{stats.maintenance}</span>
          </div>
          <div className="p-3 bg-amber-50 text-amber-500 rounded-xl"><Wrench className="h-5 w-5" /></div>
        </div>
        <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider">Expiring Soon</span>
            <span className="text-2xl font-black text-amber-500 mt-1 block">{stats.warrantyExpiringSoon}</span>
          </div>
          <div className="p-3 bg-amber-50 text-amber-500 rounded-xl"><Clock className="h-5 w-5" /></div>
        </div>
        <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider">Warranty Expired</span>
            <span className="text-2xl font-black text-rose-600 mt-1 block">{stats.warrantyExpired}</span>
          </div>
          <div className="p-3 bg-rose-50 text-rose-500 rounded-xl"><AlertCircle className="h-5 w-5" /></div>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Search Assets</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
              placeholder="Search name, S/N, brand, assignee..."
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Type</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
          >
            <option value="all">All Types</option>
            <option value="laptop">Laptops</option>
            <option value="phone">Phones</option>
            <option value="printer">Printers</option>
            <option value="peripheral">Peripherals</option>
            <option value="other">Others</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
          >
            <option value="all">All Statuses</option>
            <option value="available">Available</option>
            <option value="assigned">Assigned</option>
            <option value="maintenance">Maintenance</option>
            <option value="retired">Retired</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Warranty</label>
          <select
            value={warrantyFilter}
            onChange={(e) => setWarrantyFilter(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
          >
            <option value="all">All Warranties</option>
            <option value="active">Active/Unspecified</option>
            <option value="expiring_soon">Expiring Soon (30d)</option>
            <option value="expired">Expired</option>
          </select>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex justify-between items-center">
        <span className="text-xs font-bold text-slate-400">Showing {filteredAssets.length} total assets</span>
        <div className="flex items-center gap-2">
          <button
            onClick={openCreateForm}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 shadow-sm transition-all"
          >
            <Plus className="h-4 w-4" />
            Register Asset
          </button>
          <button
            onClick={() => void loadData()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 shadow-sm transition-all"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Assets List */}
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
        <div className="overflow-x-auto flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <span className="text-sm text-slate-400 flex items-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
                Loading assets...
              </span>
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2">
              <Package className="h-8 w-8 text-slate-300" />
              <span className="text-sm font-semibold text-slate-500">No assets registered yet</span>
              <span className="text-xs text-slate-400">Add an asset to start tracking it.</span>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-bold uppercase tracking-wider text-slate-400">
                  <th className="px-6 py-4">Asset Details</th>
                  <th className="px-6 py-4">Brand/Model</th>
                  <th className="px-6 py-4">S/N</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Assignee</th>
                  <th className="px-6 py-4">Warranty</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                {paginatedAssets.map((asset) => {
                  const warrantyInfo = getWarrantyStatus(asset.warrantyExpiry);
                  return (
                    <tr key={asset.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-slate-50 rounded-xl text-slate-500">
                            {getAssetIcon(asset.type)}
                          </div>
                          <div>
                            <span className="font-bold text-slate-800 block">{asset.name}</span>
                            <span className="text-xs text-slate-400 capitalize">{asset.type}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-medium text-slate-700">{asset.brand}</span>
                        {asset.model && <span className="text-xs text-slate-400 block">{asset.model}</span>}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-500">{asset.serialNumber}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusColor(asset.status)}`}>
                          {asset.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {asset.status === "assigned" ? (
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-[10px] font-bold">
                              {(asset.assignedToName || "").substring(0, 2).toUpperCase()}
                            </div>
                            <span className="font-medium text-slate-700">{asset.assignedToName || ""}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${warrantyInfo.color}`}>
                            {warrantyInfo.text}
                          </span>
                          {asset.warrantyExpiry && (
                            <span className="text-slate-400 block text-[10px] mt-0.5">
                              Exp: {formatDate(asset.warrantyExpiry)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setViewAsset(asset)}
                            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                            title="View Log/History"
                          >
                            <History className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => openEditForm(asset)}
                            className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Edit Asset"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              setDeleteAssetId(asset.id);
                              setDeleteDialogOpen(true);
                            }}
                            className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Delete Asset"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination controls */}
        {filteredAssets.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/30 px-6 py-4">
            <span className="text-xs font-semibold text-slate-400">
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
                className="p-2 border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white rounded-lg text-slate-500 shadow-sm transition-all"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(page + 1)}
                className="p-2 border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white rounded-lg text-slate-500 shadow-sm transition-all"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-slate-100 flex flex-col max-h-[90vh]">
            <header className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-extrabold text-slate-800 text-lg">
                {editingAssetId ? "Update Asset Record" : "Register New Asset"}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all"
              >
                &times;
              </button>
            </header>
            <form onSubmit={(e) => void handleSubmit(e)} className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Asset Name *</label>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. MacBook Pro 16-inch"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Asset Type *</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as AssetType)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                  >
                    <option value="laptop">Laptop</option>
                    <option value="phone">Phone</option>
                    <option value="printer">Printer</option>
                    <option value="peripheral">Peripheral</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Brand *</label>
                  <input
                    required
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    placeholder="e.g. Apple, Epson, Dell"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Model</label>
                  <input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="e.g. M3 Max, L3210"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Serial Number *</label>
                  <div className="relative">
                    <input
                      required
                      value={serialNumber}
                      onChange={(e) => setSerialNumber(e.target.value)}
                      placeholder="e.g. C02F5XXXYYYY"
                      className="w-full rounded-xl border border-slate-200 bg-white pl-4 pr-10 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowScanner(true)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-50 transition-all"
                      title="Scan Barcode / QR Code"
                    >
                      <QrCode className="h-4.5 w-4.5" />
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Status *</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as AssetStatus)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                  >
                    <option value="available">Available</option>
                    <option value="assigned">Assigned</option>
                    <option value="maintenance">Maintenance/Repair</option>
                    <option value="retired">Retired</option>
                  </select>
                </div>

                {status === "assigned" && (
                  <div className="space-y-1.5 md:col-span-2 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">Assign to Staff Member *</label>
                    <select
                      required
                      value={assignedTo}
                      onChange={(e) => setAssignedTo(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all mt-1"
                    >
                      <option value="">-- Select Staff Assignee --</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 pt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Purchase Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="date"
                      value={purchaseDate}
                      onChange={(e) => setPurchaseDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Purchase Cost ($)</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={purchaseCost}
                      onChange={(e) => setPurchaseCost(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Warranty Expiration</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="date"
                      value={warrantyExpiry}
                      onChange={(e) => setWarrantyExpiry(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Additional Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Purchase vendor, warranty conditions, hardware issues, etc."
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-5 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all flex items-center gap-1.5"
                >
                  {isSubmitting && <RefreshCw className="h-4 w-4 animate-spin" />}
                  {editingAssetId ? "Update Asset" : "Register Asset"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Asset Detail / History Drawer */}
      {viewAsset && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col animation-slide-in">
            <header className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  {getAssetIcon(viewAsset.type)}
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-base">{viewAsset.name}</h3>
                  <span className="text-xs text-slate-400 capitalize">{viewAsset.brand} {viewAsset.model}</span>
                </div>
              </div>
              <button
                onClick={() => setViewAsset(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all text-xl"
              >
                &times;
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Asset Specs */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Info className="h-4 w-4" />
                  Asset Information
                </h4>
                <div className="grid grid-cols-2 gap-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-100 text-xs">
                  <div>
                    <span className="text-slate-400 font-semibold block">Serial Number</span>
                    <span className="text-slate-700 font-mono text-[11px] font-bold select-all">{viewAsset.serialNumber}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold block">Status</span>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] mt-0.5 font-bold border capitalize ${getStatusColor(viewAsset.status)}`}>
                      {viewAsset.status}
                    </span>
                  </div>
                  {viewAsset.status === "assigned" && (
                    <div className="col-span-2">
                      <span className="text-slate-400 font-semibold block">Assignee</span>
                      <span className="text-slate-700 font-bold block mt-0.5">{viewAsset.assignedToName}</span>
                      {viewAsset.assignedAt && (
                        <span className="text-slate-400 text-[10px] block mt-0.5">
                          Assigned on {formatDate(viewAsset.assignedAt)}
                        </span>
                      )}
                    </div>
                  )}
                  <div>
                    <span className="text-slate-400 font-semibold block">Purchase Date</span>
                    <span className="text-slate-700 font-bold block">{formatDate(viewAsset.purchaseDate)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold block">Purchase Cost</span>
                    <span className="text-slate-700 font-bold block">{formatCost(viewAsset.purchaseCost)}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-400 font-semibold block">Warranty Expiry</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-slate-700 font-bold">{formatDate(viewAsset.warrantyExpiry)}</span>
                      <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded border ${getWarrantyStatus(viewAsset.warrantyExpiry).color}`}>
                        {getWarrantyStatus(viewAsset.warrantyExpiry).text}
                      </span>
                    </div>
                  </div>
                  {viewAsset.notes && (
                    <div className="col-span-2 border-t border-slate-100 pt-2 mt-1">
                      <span className="text-slate-400 font-semibold block">Notes</span>
                      <p className="text-slate-600 whitespace-pre-wrap select-all italic mt-0.5">{viewAsset.notes}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Assignment Audit Log */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <History className="h-4 w-4" />
                  Assignment & Activity Audit Log
                </h4>
                
                {isLoadingHistory ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-4 w-4 animate-spin text-slate-400" />
                  </div>
                ) : history.length === 0 ? (
                  <p className="text-xs text-slate-400 italic text-center py-4 bg-slate-50/30 rounded-xl border border-dashed border-slate-200">
                    No history log entries available for this asset.
                  </p>
                ) : (
                  <div className="relative border-l border-slate-100 pl-4 ml-2.5 space-y-5">
                    {history.map((log) => (
                      <div key={log.id} className="relative">
                        {/* Dot indicator */}
                        <div className="absolute -left-[21.5px] top-1 h-3 w-3 rounded-full border-2 border-white bg-slate-400" />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-700">{log.action}</span>
                            <span className="text-[10px] text-slate-400">•</span>
                            <span className="text-[10px] text-slate-400 font-semibold">{formatDate(log.date)}</span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">{log.details}</p>
                          <span className="text-[10px] text-slate-400 mt-1 block">Logged by: {log.changedByName}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <footer className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-2">
              <button
                onClick={() => {
                  const assetToEdit = viewAsset;
                  setViewAsset(null);
                  openEditForm(assetToEdit);
                }}
                className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-600 shadow-sm transition-all"
              >
                Edit Details
              </button>
              <button
                onClick={() => setViewAsset(null)}
                className="rounded-xl bg-slate-700 hover:bg-slate-800 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all"
              >
                Close Drawer
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="rounded-2xl border border-slate-100 bg-white shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-800 font-bold">
              Remove Asset Record
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-500 text-sm">
              Are you sure you want to delete this asset from the registry? All warranty history and assignment log entries associated with this asset will be permanently deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel
              onClick={() => {
                setDeleteAssetId(null);
                setDeleteDialogOpen(false);
              }}
              className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition-all"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDelete()}
              className="rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all"
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Barcode/QR Code Scanner Overlay */}
      {showScanner && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
          <style>{`
            #qr-reader-target video {
              object-fit: cover !important;
              width: 100% !important;
              height: 100% !important;
              border-radius: 1rem;
            }
            #qr-reader-target {
              border: none !important;
            }
          `}</style>
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-xl border border-slate-100 flex flex-col items-center relative overflow-hidden">
            <div className="absolute right-4 top-4 flex items-center gap-1">
              {devices.length > 1 && (
                <button
                  type="button"
                  onClick={() => void handleSwitchCamera()}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all flex items-center justify-center"
                  title="Switch Camera"
                >
                  <RefreshCw className="h-4.5 w-4.5" />
                </button>
              )}
              <button
                onClick={() => setShowScanner(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all font-bold text-lg leading-none"
              >
                &times;
              </button>
            </div>
            <div className="text-center mb-5">
              <h3 className="font-extrabold text-slate-800 text-base flex items-center justify-center gap-1.5">
                <QrCode className="h-5 w-5 text-blue-600" />
                Scan Serial Number
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Position the barcode or QR code inside the green scanner zone.
              </p>
              {devices.length > 1 && (
                <p className="text-[10px] text-blue-500 font-semibold mt-1">
                  Active Camera: {devices[activeDeviceIndex]?.label || `Camera ${activeDeviceIndex + 1}`}
                </p>
              )}
            </div>
            
            <div className="w-full aspect-square max-w-[280px] rounded-2xl overflow-hidden bg-slate-950 relative border border-slate-800 shadow-inner flex items-center justify-center">
              <div id="qr-reader-target" className="w-full h-full" />
              {/* Green scanner border overlay (horizontal rectangle matching wide barcode scanning region) */}
              <div className="absolute left-6 right-6 top-[30%] bottom-[30%] border border-emerald-500/70 rounded-xl pointer-events-none">
                {/* Corner highlights */}
                <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-emerald-400 rounded-tl" />
                <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-emerald-400 rounded-tr" />
                <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-emerald-400 rounded-bl" />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-emerald-400 rounded-br" />
                {/* Scanning laser effect */}
                <div className="absolute left-0 right-0 h-0.5 bg-emerald-400 top-1/2 -translate-y-1/2 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-bounce" />
              </div>
            </div>
            
            <div className="flex gap-2 w-full mt-6">
              <label className="flex-1 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 py-2.5 text-xs font-semibold text-slate-600 shadow-sm transition-all text-center cursor-pointer flex items-center justify-center gap-1.5">
                <UploadCloud className="h-4 w-4 text-slate-500" />
                Upload Photo
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileScan}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                onClick={() => setShowScanner(false)}
                className="flex-1 rounded-xl bg-slate-700 hover:bg-slate-800 py-2.5 text-xs font-semibold text-white shadow-sm transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
