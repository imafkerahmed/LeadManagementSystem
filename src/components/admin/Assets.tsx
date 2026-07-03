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
  User,
  Laptop,
  Smartphone,
  Printer,
  Package,
  ChevronLeft,
  ChevronRight,
  History,
  Tag,
  Wrench,
  RefreshCw,
  QrCode,
  UploadCloud,
  UserPlus,
  UserCheck,
  FileText,
  Eye,
  ExternalLink,
  X,
} from "lucide-react";
import { Asset, AssetType, AssetStatus, AssetHistory, User as SystemUser } from "@/types";
import { createPocketBaseClient, pocketBaseUrl } from "@/lib/pocketbase";
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

const generateAlphanumericId = (assetsList: Asset[], tempList: string[] = []) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const existing = new Set([
    ...assetsList.map(a => (a.asset_id || "").toUpperCase()),
    ...tempList.map(t => t.toUpperCase())
  ]);

  while (true) {
    let result = "";
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const candidate = `AST-${result}`;
    if (!existing.has(candidate)) {
      return candidate;
    }
  }
};

const generateUniqueInvoiceId = (existingInvoicesList: { invoiceId: string }[]) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const existing = new Set(existingInvoicesList.map(inv => (inv.invoiceId || "").toUpperCase()));
  while (true) {
    let result = "";
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const candidate = `INV-${result}`;
    if (!existing.has(candidate)) {
      return candidate;
    }
  }
};

export default function AdminAssets() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);

  // View state: menu dashboard or specific lists
  const [currentView, setCurrentView] = useState<"menu" | "all" | "assigned" | "available" | "invoices">("menu");

  // Filters state
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [warrantyFilter, setWarrantyFilter] = useState("all");

  // Pagination state
  const [page, setPage] = useState(1);
  const pageSize = 12;

  // Invoices list state and filters
  const [invoicesList, setInvoicesList] = useState<any[]>([]);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoicePage, setInvoicePage] = useState(1);
  const invoicePageSize = 10;

  // Single form states
  const [type, setType] = useState<AssetType>("laptop");
  const [isCustomType, setIsCustomType] = useState(false);
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [status, setStatus] = useState<AssetStatus>("available");
  const [assignedTo, setAssignedTo] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [assignmentType, setAssignmentType] = useState<"user" | "location">("user");
  const [assignedLocation, setAssignedLocation] = useState("");
  const [prevAssignedLocation, setPrevAssignedLocation] = useState<string | null>(null);
  const [purchaseCost, setPurchaseCost] = useState("");
  const [warrantyExpiry, setWarrantyExpiry] = useState("");
  const [notes, setNotes] = useState("");
  
  const [assetIdInput, setAssetIdInput] = useState("");
  const [invoiceFileState, setInvoiceFileState] = useState<File | null>(null);
  const [existingInvoice, setExistingInvoice] = useState<string | null>(null);
  const [removeInvoice, setRemoveInvoice] = useState(false);
  const [selectedExistingInvoice, setSelectedExistingInvoice] = useState("");

  // Previous values to track changes for history logs
  const [prevStatus, setPrevStatus] = useState<AssetStatus | null>(null);
  const [prevAssignedTo, setPrevAssignedTo] = useState<string | null>(null);

  // Selection state for printing
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);

  // Dialogs state
  const [deleteAssetId, setDeleteAssetId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [viewAsset, setViewAsset] = useState<Asset | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<any | null>(null);

  // Quick Assign state
  const [assignAsset, setAssignAsset] = useState<Asset | null>(null);
  const [assignUserId, setAssignUserId] = useState("");
  const [quickAssignType, setQuickAssignType] = useState<"user" | "location">("user");
  const [quickAssignLocation, setQuickAssignLocation] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);

  // History logs state
  const [history, setHistory] = useState<AssetHistory[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Scanner state
  const [showScanner, setShowScanner] = useState(false);
  const [scannerTarget, setScannerTarget] = useState<"serialNumber" | "assetId" | "bulk">("serialNumber");
  const [devices, setDevices] = useState<any[]>([]);
  const [activeDeviceIndex, setActiveDeviceIndex] = useState<number>(0);
  const scannerRef = useRef<any>(null);

  // Bulk Add form states
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [bulkType, setBulkType] = useState<AssetType>("laptop");
  const [isBulkCustomType, setIsBulkCustomType] = useState(false);
  const [bulkBrand, setBulkBrand] = useState("");
  const [bulkModel, setBulkModel] = useState("");
  const [bulkPurchaseDate, setBulkPurchaseDate] = useState("");
  const [bulkPurchaseCost, setBulkPurchaseCost] = useState("");
  const [bulkWarrantyExpiry, setBulkWarrantyExpiry] = useState("");
  const [bulkNotes, setBulkNotes] = useState("");
  const [bulkAssetIds, setBulkAssetIds] = useState<string[]>([]);
  const [bulkManualInput, setBulkManualInput] = useState("");
  const [bulkGenQty, setBulkGenQty] = useState("5");
  const [isContinuousScan, setIsContinuousScan] = useState(false);
  const [bulkInvoiceFileState, setBulkInvoiceFileState] = useState<File | null>(null);
  const [selectedBulkExistingInvoice, setSelectedBulkExistingInvoice] = useState("");

  // Bulk Assign Invoice state
  const [showBulkInvoiceModal, setShowBulkInvoiceModal] = useState(false);
  const [bulkInvoiceFile, setBulkInvoiceFile] = useState<File | null>(null);
  const [isAssigningInvoice, setIsAssigningInvoice] = useState(false);



  const getInvoiceFileUrl = (asset: Asset) => {
    if (!asset.invoiceFile) return "";
    const pb = createPocketBaseClient();
    const token = pb.authStore.token;
    const suffix = token ? `?token=${token}` : "";
    if (asset.invoice) {
      return `${pocketBaseUrl}/api/files/invoices/${asset.invoice}/${asset.invoiceFile}${suffix}`;
    }
    return `${pocketBaseUrl}/api/files/assets/${asset.id}/${asset.invoiceFile}${suffix}`;
  };

  const handleBulkGenerateIds = () => {
    const qty = parseInt(bulkGenQty) || 0;
    if (qty <= 0) {
      toast.error("Please enter a valid quantity.");
      return;
    }
    setBulkAssetIds((prev) => {
      const merged = [...prev];
      let added = 0;
      for (let i = 0; i < qty; i++) {
        const uniqueId = generateAlphanumericId(assets, merged);
        merged.push(uniqueId);
        added++;
      }
      if (added > 0) {
        toast.success(`Generated and added ${added} unique Asset IDs.`);
      }
      return merged;
    });
  };

  // Web Audio context for continuous scan beep feedback
  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 pitch
      gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
      oscillator.start();
      setTimeout(() => {
        oscillator.stop();
        audioCtx.close();
      }, 95);
    } catch (e) {
      console.warn("Audio Context beep failed:", e);
    }
  };

  // HTML5 Barcode/QR scanner trigger overlay
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
                  if (idx !== -1) setActiveDeviceIndex(idx);
                } else if (activeCameraIdOrConfig?.facingMode === "environment") {
                  const backIdx = list.findIndex((d: any) => {
                    const lbl = d.label.toLowerCase();
                    return lbl.includes("back") || lbl.includes("rear") || lbl.includes("environment");
                  });
                  if (backIdx !== -1) setActiveDeviceIndex(backIdx);
                }
              }
            } catch (e) {
              console.warn("Could not retrieve camera device list:", e);
            }
          };
          
          const startScanning = (cameraIdOrConfig: any) => {
            html5QrCode.start(
              cameraIdOrConfig,
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
                const code = decodedText.trim();
                if (scannerTarget === "bulk") {
                  playBeep();
                  setBulkAssetIds((prev) => {
                    if (prev.includes(code)) {
                      toast.warning(`Asset ID ${code} is already in the list.`);
                      return prev;
                    }
                    toast.success(`Scanned: ${code}`);
                    return [...prev, code];
                  });
                  if (!isContinuousScan) setShowScanner(false);
                } else if (scannerTarget === "assetId") {
                  setAssetIdInput(code);
                  toast.success(`Asset ID scanned: ${code}`);
                  setShowScanner(false);
                } else {
                  setSerialNumber(code);
                  toast.success(`Serial Number scanned: ${code}`);
                  setShowScanner(false);
                }
              },
              () => {}
            ).then(() => {
              loadDevicesAndSync(cameraIdOrConfig);
            }).catch((err: any) => {
              console.error(`Camera start failed:`, err);
              if (cameraIdOrConfig?.facingMode === "environment") {
                startScanning({ facingMode: "user" });
              } else {
                toast.error("Could not access camera. Please verify permissions.");
                setShowScanner(false);
              }
            });
          };

          startScanning({ facingMode: "environment" });

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
            console.error("Error stopping scanner:", e);
          }
        }
        scannerRef.current = null;
        setDevices([]);
        setActiveDeviceIndex(0);
      };
    }
  }, [showScanner, scannerTarget, isContinuousScan]);

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
          const code = decodedText.trim();
          if (scannerTarget === "bulk") {
            playBeep();
            setBulkAssetIds((prev) => {
              if (prev.includes(code)) return prev;
              return [...prev, code];
            });
            if (!isContinuousScan) setShowScanner(false);
          } else if (scannerTarget === "assetId") {
            setAssetIdInput(code);
            setShowScanner(false);
          } else {
            setSerialNumber(code);
            setShowScanner(false);
          }
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
      const code = decodedText.trim();
      
      if (scannerTarget === "bulk") {
        playBeep();
        setBulkAssetIds((prev) => {
          if (prev.includes(code)) return prev;
          return [...prev, code];
        });
      } else if (scannerTarget === "assetId") {
        setAssetIdInput(code);
      } else {
        setSerialNumber(code);
      }
      
      toast.success(`Code detected: ${code}`);
      setShowScanner(false);
    } catch (err) {
      console.error("File scanning failed:", err);
      toast.error("Could not detect barcode. Please ensure photo is well-lit.");
      setShowScanner(false);
      setTimeout(() => setShowScanner(true), 400);
    }
  };

  // Reset to page 1 when search filters change
  useEffect(() => {
    setPage(1);
  }, [searchTerm, typeFilter, statusFilter, warrantyFilter, currentView]);

  useEffect(() => {
    setInvoicePage(1);
  }, [invoiceSearch]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const pb = createPocketBaseClient();
      
      // Fetch users safely through route proxy
      const token = pb.authStore.token;
      const fetchOptions: RequestInit = { cache: "no-store" };
      if (token) {
        fetchOptions.headers = { Authorization: `Bearer ${token}` };
      }
      const usersResponse = await fetch("/api/admin/users", fetchOptions);
      if (!usersResponse.ok) throw new Error("Failed to fetch users list");
      const usersData = await usersResponse.json();
      setUsers(usersData);

      // Fetch invoices
      try {
        const invRecords = await pb.collection("invoices").getFullList({
          sort: "-created",
        });
        setInvoicesList(invRecords);
      } catch (invErr) {
        console.error("Failed to fetch invoices list:", invErr);
      }

      // Fetch assets
      const records = await pb.collection("assets").getFullList({
        sort: "-created",
        expand: "assignedTo,invoice",
      });

      const mappedAssets: Asset[] = records.map((record) => {
        const assignee = record.expand?.assignedTo as { name?: string; email?: string } | undefined;
        const invoiceObj = record.expand?.invoice as { id: string; file: string; name?: string } | undefined;
        return {
          id: record.id,
          asset_id: record.asset_id || record.assetId || `AST-MIG-${record.id.slice(-6).toUpperCase()}`,
          name: record.name,
          type: record.type as AssetType,
          brand: record.brand,
          model: record.model || "",
          serialNumber: record.serialNumber || "",
          status: record.status as AssetStatus,
          assignedTo: record.assignedTo || "",
          assignedToName: assignee?.name || assignee?.email || "",
          assignedAt: record.assignedAt || "",
          assignedLocation: record.assignedLocation || "",
          purchaseDate: record.purchaseDate || "",
          purchaseCost: record.purchaseCost || undefined,
          warrantyExpiry: record.warrantyExpiry || "",
          notes: record.notes || "",
          invoice: record.invoice || "",
          invoiceFile: invoiceObj ? invoiceObj.file : (record.invoiceFile || ""),
          invoiceFilename: invoiceObj ? (invoiceObj.name || invoiceObj.file) : "",
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

  // Compute Metrics Cards
  const stats = useMemo(() => {
    const total = assets.length;
    const assigned = assets.filter((a) => a.status === "assigned").length;
    const available = assets.filter((a) => a.status === "available").length;
    const maintenance = assets.filter((a) => a.status === "maintenance").length;
    
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

  // Load audit history logs for viewed asset drawer
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
        console.error("Error loading asset audit logs:", error);
        toast.error("Failed to load asset history logs.");
      } finally {
        setIsLoadingHistory(false);
      }
    };

    void loadHistory();
  }, [viewAsset]);

  // All Types list (including custom user-defined types capitalized)
  const allTypes = useMemo(() => {
    const defaults = ["laptop", "phone", "printer", "peripheral", "other"];
    const dbTypes = assets.map((a) => a.type.toLowerCase().trim()).filter(Boolean);
    return Array.from(new Set([...defaults, ...dbTypes]));
  }, [assets]);

  // Filter lists for All Assets
  const filteredAssets = useMemo(() => {
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    return assets.filter((asset) => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        asset.name.toLowerCase().includes(searchLower) ||
        asset.asset_id.toLowerCase().includes(searchLower) ||
        asset.serialNumber.toLowerCase().includes(searchLower) ||
        asset.brand.toLowerCase().includes(searchLower) ||
        (asset.model || "").toLowerCase().includes(searchLower) ||
        (asset.assignedToName || "").toLowerCase().includes(searchLower);

      const matchesType = typeFilter === "all" || asset.type === typeFilter;
      const matchesStatus = statusFilter === "all" || asset.status === statusFilter;

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

  // Filter lists for Assigned Assets Card Click
  const filteredAssignedAssets = useMemo(() => {
    return assets.filter((a) => {
      if (a.status !== "assigned") return false;
      
      // search term filter
      if (searchTerm.trim()) {
        const searchLower = searchTerm.toLowerCase();
        const matches = 
          a.name.toLowerCase().includes(searchLower) ||
          a.asset_id.toLowerCase().includes(searchLower) ||
          a.brand.toLowerCase().includes(searchLower) ||
          (a.model || "").toLowerCase().includes(searchLower) ||
          (a.assignedToName || "").toLowerCase().includes(searchLower) ||
          (a.assignedLocation || "").toLowerCase().includes(searchLower);
        if (!matches) return false;
      }

      // type filter
      if (typeFilter !== "all" && a.type !== typeFilter) return false;

      // warranty filter
      if (warrantyFilter !== "all") {
        const info = getWarrantyStatus(a.warrantyExpiry);
        if (warrantyFilter === "active" && info.text !== "Active") return false;
        if (warrantyFilter === "expired" && info.text !== "Expired") return false;
        if (warrantyFilter === "expiring_soon" && info.text !== "Expiring Soon") return false;
      }

      return true;
    });
  }, [assets, searchTerm, typeFilter, warrantyFilter]);

  // Filter lists for Available Assets Card Click
  const filteredAvailableAssets = useMemo(() => {
    return assets.filter((a) => {
      if (a.status !== "available") return false;
      
      // search term filter
      if (searchTerm.trim()) {
        const searchLower = searchTerm.toLowerCase();
        const matches = 
          a.name.toLowerCase().includes(searchLower) ||
          a.asset_id.toLowerCase().includes(searchLower) ||
          a.brand.toLowerCase().includes(searchLower) ||
          (a.model || "").toLowerCase().includes(searchLower);
        if (!matches) return false;
      }

      // type filter
      if (typeFilter !== "all" && a.type !== typeFilter) return false;

      // warranty filter
      if (warrantyFilter !== "all") {
        const info = getWarrantyStatus(a.warrantyExpiry);
        if (warrantyFilter === "active" && info.text !== "Active") return false;
        if (warrantyFilter === "expired" && info.text !== "Expired") return false;
        if (warrantyFilter === "expiring_soon" && info.text !== "Expiring Soon") return false;
      }

      return true;
    });
  }, [assets, searchTerm, typeFilter, warrantyFilter]);

  // Get active filtered list based on currentView
  const currentFilteredList = useMemo(() => {
    if (currentView === "all") return filteredAssets;
    if (currentView === "assigned") return filteredAssignedAssets;
    return filteredAvailableAssets;
  }, [currentView, filteredAssets, filteredAssignedAssets, filteredAvailableAssets]);

  // Pagination bounds
  const paginatedAssets = useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    return currentFilteredList.slice(startIndex, startIndex + pageSize);
  }, [currentFilteredList, page]);

  const totalPages = Math.ceil(currentFilteredList.length / pageSize) || 1;

  // Table view helper states
  const viewAssets = paginatedAssets;

  const isAllSelected = useMemo(() => {
    return viewAssets.length > 0 && viewAssets.every((a) => selectedAssetIds.includes(a.id));
  }, [viewAssets, selectedAssetIds]);

  const handleToggleSelectAll = (checked: boolean) => {
    setSelectedAssetIds((prev) => {
      const pageIds = viewAssets.map((a) => a.id);
      if (checked) {
        const newSelection = [...prev];
        pageIds.forEach((id) => {
          if (!newSelection.includes(id)) newSelection.push(id);
        });
        return newSelection;
      } else {
        return prev.filter((id) => !pageIds.includes(id));
      }
    });
  };

  // Get unique previously added invoices from loaded assets and invoices collection
  const existingInvoices = useMemo(() => {
    return invoicesList.map((inv) => {
      // Find one asset that uses this invoice to show as assetName reference
      const linked = assets.filter((a) => a.invoice === inv.id);
      const refAsset = linked[0];
      return {
        id: inv.id,
        filename: inv.file,
        invoiceId: inv.invoiceId || "",
        name: inv.name || inv.file,
        created: inv.created,
        linkedAssets: linked,
        assetName: refAsset ? `${refAsset.brand} ${refAsset.model}`.trim() || refAsset.name : "None",
      };
    });
  }, [invoicesList, assets]);

  // Invoices Search and Pagination bound list
  const filteredInvoicesList = useMemo(() => {
    return existingInvoices.filter((inv) => {
      const searchLower = invoiceSearch.toLowerCase();
      return (
        inv.filename.toLowerCase().includes(searchLower) ||
        inv.invoiceId.toLowerCase().includes(searchLower) ||
        inv.name.toLowerCase().includes(searchLower) ||
        inv.assetName.toLowerCase().includes(searchLower)
      );
    });
  }, [existingInvoices, invoiceSearch]);

  const paginatedInvoices = useMemo(() => {
    const startIndex = (invoicePage - 1) * invoicePageSize;
    return filteredInvoicesList.slice(startIndex, startIndex + invoicePageSize);
  }, [filteredInvoicesList, invoicePage]);

  const totalInvoicePages = Math.ceil(filteredInvoicesList.length / invoicePageSize) || 1;

  // Single Registration Form controls
  const openCreateForm = () => {
    setType("laptop");
    setIsCustomType(false);
    setBrand("");
    setModel("");
    setSerialNumber("");
    setStatus("available");
    setAssignedTo("");
    setAssignmentType("user");
    setAssignedLocation("");
    setPurchaseDate("");
    setPurchaseCost("");
    setWarrantyExpiry("");
    setNotes("");
    setAssetIdInput(generateAlphanumericId(assets));
    setInvoiceFileState(null);
    setExistingInvoice(null);
    setRemoveInvoice(false);
    setSelectedExistingInvoice("");
    setEditingAssetId(null);
    setPrevStatus(null);
    setPrevAssignedTo(null);
    setPrevAssignedLocation(null);
    setShowForm(true);
  };

  const openEditForm = (asset: Asset) => {
    setType(asset.type);
    setIsCustomType(!["laptop", "phone", "printer", "peripheral", "other"].includes(asset.type));
    setBrand(asset.brand);
    setModel(asset.model || "");
    setSerialNumber(asset.serialNumber);
    setStatus(asset.status);
    setAssignedTo(asset.assignedTo || "");
    setAssignmentType(asset.assignedLocation ? "location" : "user");
    setAssignedLocation(asset.assignedLocation || "");
    setPurchaseDate(asset.purchaseDate ? asset.purchaseDate.split("T")[0] : "");
    setPurchaseCost(asset.purchaseCost ? String(asset.purchaseCost) : "");
    setWarrantyExpiry(asset.warrantyExpiry ? asset.warrantyExpiry.split("T")[0] : "");
    setNotes(asset.notes || "");
    setAssetIdInput(asset.asset_id);
    setInvoiceFileState(null);
    setExistingInvoice(asset.invoiceFile || null);
    setRemoveInvoice(false);
    setSelectedExistingInvoice("");
    setEditingAssetId(asset.id);
    setPrevStatus(asset.status);
    setPrevAssignedTo(asset.assignedTo || null);
    setPrevAssignedLocation(asset.assignedLocation || null);
    setShowForm(true);
  };

  // Submit handler for creating/editing single asset
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brand.trim()) {
      toast.error("Please fill in the Brand.");
      return;
    }

    setIsSubmitting(true);
    try {
      const pb = createPocketBaseClient();
      const currentUser = pb.authStore.model;

      if (!currentUser) {
        toast.error("User session expired. Please sign in again.");
        setIsSubmitting(false);
        return;
      }

      // Validate Asset ID uniqueness locally against loaded assets list
      const finalAssetId = assetIdInput.trim() || generateAlphanumericId(assets);
      const isDuplicate = assets.some(
        (a) => a.asset_id.toUpperCase() === finalAssetId.toUpperCase() && a.id !== editingAssetId
      );

      if (isDuplicate) {
        toast.error("This Asset ID is already registered.");
        setIsSubmitting(false);
        return;
      }

      // serialNumber is optional, do not fallback to Asset ID if left blank
      const finalSerialNumber = serialNumber.trim();
      if (finalSerialNumber) {
        const isSerialDuplicate = assets.some(
          (a) => a.serialNumber && a.serialNumber.toUpperCase() === finalSerialNumber.toUpperCase() && a.id !== editingAssetId
        );
        if (isSerialDuplicate) {
          toast.error("An asset with this manufacturer serial number already exists.");
          setIsSubmitting(false);
          return;
        }
      }

      const isStatusChangedToAssigned = status === "assigned" && prevStatus !== "assigned";
      const isStatusChangedFromAssigned = status !== "assigned" && prevStatus === "assigned";
      
      const finalName = `${brand.trim()} ${model.trim()}`.trim();
      const formData = new FormData();
      formData.append("asset_id", finalAssetId);
      formData.append("name", finalName);
      formData.append("type", type.trim());
      formData.append("brand", brand.trim());
      formData.append("model", model.trim());
      formData.append("serialNumber", finalSerialNumber);
      formData.append("status", status);
      formData.append("assignedTo", status === "assigned" && assignmentType === "user" && assignedTo ? assignedTo : "");
      formData.append("assignedLocation", status === "assigned" && assignmentType === "location" && assignedLocation ? assignedLocation.trim() : "");
      formData.append("assignedAt", status === "assigned" ? (isStatusChangedToAssigned || (assignmentType === "user" ? assignedTo !== prevAssignedTo : assignedLocation !== prevAssignedLocation) ? new Date().toISOString() : "") : "");
      formData.append("purchaseDate", purchaseDate ? new Date(purchaseDate).toISOString() : "");
      formData.append("purchaseCost", purchaseCost ? String(parseFloat(purchaseCost)) : "");
      formData.append("warrantyExpiry", warrantyExpiry ? new Date(warrantyExpiry).toISOString() : "");
      formData.append("notes", notes.trim());

      let invoiceRelationId = "";
      if (invoiceFileState) {
        try {
          const invoiceFormData = new FormData();
          invoiceFormData.append("file", invoiceFileState);
          invoiceFormData.append("name", invoiceFileState.name);
          invoiceFormData.append("invoiceId", generateUniqueInvoiceId(existingInvoices));
          const invoiceRecord = await pb.collection("invoices").create(invoiceFormData);
          invoiceRelationId = invoiceRecord.id;
        } catch (uploadErr) {
          console.error("Failed to upload invoice file:", uploadErr);
          toast.error("Failed to upload invoice file.");
          setIsSubmitting(false);
          return;
        }
      } else if (selectedExistingInvoice) {
        const source = assets.find((a) => a.invoiceFile === selectedExistingInvoice);
        if (source && source.invoice) {
          invoiceRelationId = source.invoice;
        }
      }

      if (removeInvoice) {
        formData.append("invoice", "");
      } else if (invoiceRelationId) {
        formData.append("invoice", invoiceRelationId);
      }

      if (editingAssetId) {
        await pb.collection("assets").update(editingAssetId, formData);

        // Generate activity logs
        const historyLogs = [];
        if (prevStatus !== status) {
          historyLogs.push({
            action: "Status Update",
            details: `Status updated from "${prevStatus}" to "${status}".`
          });
        }

        if (status === "assigned") {
          if (assignmentType === "user" && assignedTo !== prevAssignedTo) {
            const selectedUser = users.find((u) => u.id === assignedTo);
            const uName = selectedUser?.name || selectedUser?.email || "Unknown User";
            historyLogs.push({
              action: "Assignment",
              details: `Asset assigned to user ${uName}.`
            });
          } else if (assignmentType === "location" && assignedLocation !== prevAssignedLocation) {
            historyLogs.push({
              action: "Assignment",
              details: `Asset assigned to location "${assignedLocation}".`
            });
          }
        } else if (isStatusChangedFromAssigned) {
          if (prevAssignedTo) {
            const prevUser = users.find((u) => u.id === prevAssignedTo);
            const prevUserName = prevUser?.name || prevUser?.email || "Unknown User";
            historyLogs.push({
              action: "Unassignment",
              details: `Asset unassigned from user ${prevUserName}.`
            });
          } else if (prevAssignedLocation) {
            historyLogs.push({
              action: "Unassignment",
              details: `Asset unassigned from location "${prevAssignedLocation}".`
            });
          }
        }

        if (historyLogs.length === 0) {
          historyLogs.push({
            action: "Update",
            details: "Asset configuration details updated."
          });
        }

        for (const log of historyLogs) {
          await pb.collection("assetHistory").create({
            assetId: editingAssetId,
            changedBy: currentUser.id,
            action: log.action,
            details: log.details,
            date: new Date().toISOString(),
          });
        }

        toast.success("Asset record updated successfully.");
      } else {
        const created = await pb.collection("assets").create(formData);

        await pb.collection("assetHistory").create({
          assetId: created.id,
          changedBy: currentUser.id,
          action: "Create",
          details: "Asset registered in registry database.",
          date: new Date().toISOString(),
        });

        if (status === "assigned") {
          if (assignmentType === "user" && assignedTo) {
            const selectedUser = users.find((u) => u.id === assignedTo);
            const uName = selectedUser?.name || selectedUser?.email || "Unknown User";
            await pb.collection("assetHistory").create({
              assetId: created.id,
              changedBy: currentUser.id,
              action: "Assignment",
              details: `Asset assigned to user ${uName} at registration.`,
              date: new Date().toISOString(),
            });
          } else if (assignmentType === "location" && assignedLocation) {
            await pb.collection("assetHistory").create({
              assetId: created.id,
              changedBy: currentUser.id,
              action: "Assignment",
              details: `Asset assigned to location "${assignedLocation}" at registration.`,
              date: new Date().toISOString(),
            });
          }
        }

        toast.success("Asset registered successfully.");
      }

      setShowForm(false);
      void loadData();
    } catch (err: any) {
      console.error("Error saving asset details:", err);
      toast.error(err.message || "Failed to save asset registry record.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Action handler
  const handleDelete = async () => {
    if (!deleteAssetId) return;
    try {
      const pb = createPocketBaseClient();
      await pb.collection("assets").delete(deleteAssetId);
      toast.success("Asset registry record deleted.");
      setDeleteAssetId(null);
      setDeleteDialogOpen(false);
      void loadData();
      if (viewAsset?.id === deleteAssetId) setViewAsset(null);
    } catch (err) {
      console.error("Error deleting asset:", err);
      toast.error("Failed to delete asset record.");
    }
  };

  // Quick user assignment dialog modal submit
  const openQuickAssign = (asset: Asset) => {
    setAssignAsset(asset);
    setAssignUserId(asset.assignedTo || "");
    setQuickAssignType(asset.assignedLocation ? "location" : "user");
    setQuickAssignLocation(asset.assignedLocation || "");
  };

  const handleQuickAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignAsset) return;
    
    setIsAssigning(true);
    try {
      const pb = createPocketBaseClient();
      const currentUser = pb.authStore.model;
      if (!currentUser) {
        toast.error("User session expired. Please sign in again.");
        setIsAssigning(false);
        return;
      }

      const prevAssignedTo = assignAsset.assignedTo;
      const prevAssignedLocation = assignAsset.assignedLocation;

      const isAssigningToUser = quickAssignType === "user" && assignUserId;
      const isAssigningToLocation = quickAssignType === "location" && quickAssignLocation.trim();

      // Update asset record
      await pb.collection("assets").update(assignAsset.id, {
        status: (isAssigningToUser || isAssigningToLocation) ? "assigned" : "available",
        assignedTo: isAssigningToUser ? assignUserId : null,
        assignedLocation: isAssigningToLocation ? quickAssignLocation.trim() : null,
        assignedAt: (isAssigningToUser || isAssigningToLocation) ? new Date().toISOString() : null,
      });

      // Write to asset history log
      let details = "";
      if (isAssigningToUser) {
        const selectedUser = users.find((u) => u.id === assignUserId);
        details = `Asset assigned to user ${selectedUser?.name || "Unknown"}.`;
      } else if (isAssigningToLocation) {
        details = `Asset assigned to location "${quickAssignLocation.trim()}".`;
      } else {
        if (prevAssignedTo) {
          const prevUser = users.find((u) => u.id === prevAssignedTo);
          details = `Asset unassigned (previously assigned to ${prevUser?.name || "Unknown"}).`;
        } else if (prevAssignedLocation) {
          details = `Asset unassigned (previously assigned to location "${prevAssignedLocation}").`;
        } else {
          details = `Asset unassigned.`;
        }
      }

      await pb.collection("assetHistory").create({
        assetId: assignAsset.id,
        changedBy: currentUser.id,
        action: "Update",
        details: details,
        date: new Date().toISOString(),
      });

      toast.success("Asset assignment updated successfully.");
      setAssignAsset(null);
      void loadData();
    } catch (err: any) {
      console.error("Quick assign error:", err);
      toast.error(err.message || "Failed to update assignment.");
    } finally {
      setIsAssigning(false);
    }
  };

  const handleBulkAssignInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkInvoiceFile) {
      toast.error("Please select an invoice file to upload.");
      return;
    }
    if (selectedAssetIds.length === 0) return;

    setIsAssigningInvoice(true);
    let successCount = 0;
    let failCount = 0;

    try {
      const pb = createPocketBaseClient();
      const currentUser = pb.authStore.model;
      if (!currentUser) {
        toast.error("User session expired. Please sign in again.");
        setIsAssigningInvoice(false);
        return;
      }

      // Upload file once to the invoices collection
      const invoiceFormData = new FormData();
      invoiceFormData.append("file", bulkInvoiceFile);
      invoiceFormData.append("name", bulkInvoiceFile.name);
      invoiceFormData.append("invoiceId", generateUniqueInvoiceId(existingInvoices));
      const invoiceRecord = await pb.collection("invoices").create(invoiceFormData);
      const newInvoiceId = invoiceRecord.id;

      for (const assetId of selectedAssetIds) {
        try {
          await pb.collection("assets").update(assetId, {
            invoice: newInvoiceId
          });

          await pb.collection("assetHistory").create({
            assetId: assetId,
            changedBy: currentUser.id,
            action: "Update",
            details: `Invoice file "${bulkInvoiceFile.name}" assigned via bulk assignment.`,
            date: new Date().toISOString()
          });
          successCount++;
        } catch (err) {
          console.error(`Failed to assign invoice to asset ${assetId}:`, err);
          failCount++;
        }
      }

      toast.success(`Successfully assigned invoice to ${successCount} assets.`);
      if (failCount > 0) {
        toast.error(`Failed to assign invoice to ${failCount} assets.`);
      }
      setShowBulkInvoiceModal(false);
      setBulkInvoiceFile(null);
      setSelectedAssetIds([]);
      void loadData();
    } catch (err: any) {
      console.error("Bulk invoice assignment error:", err);
      toast.error(err.message || "Failed to complete bulk invoice assignment.");
    } finally {
      setIsAssigningInvoice(false);
    }
  };

  // Bulk add modal form handlers
  const openBulkAddForm = () => {
    setBulkType("laptop");
    setIsBulkCustomType(false);
    setBulkBrand("");
    setBulkModel("");
    setBulkPurchaseDate("");
    setBulkPurchaseCost("");
    setBulkWarrantyExpiry("");
    setBulkNotes("");
    setBulkAssetIds([]);
    setBulkManualInput("");
    setIsContinuousScan(false);
    setBulkInvoiceFileState(null);
    setBulkGenQty("5");
    setShowBulkForm(true);
  };

  const handleParseManualIds = () => {
    if (!bulkManualInput.trim()) return;
    const parsed = bulkManualInput
      .split(/[\n,]/)
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
    
    setBulkAssetIds((prev) => {
      const added = [];
      const newIds = [...prev];
      for (const id of parsed) {
        if (!newIds.includes(id)) {
          newIds.push(id);
          added.push(id);
        }
      }
      if (added.length > 0) {
        toast.success(`Added ${added.length} unique IDs to review list.`);
      }
      return newIds;
    });
    setBulkManualInput("");
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (bulkAssetIds.length === 0) {
      toast.error("Please add at least one Asset ID to continue.");
      return;
    }
    if (!bulkBrand.trim()) {
      toast.error("Brand configuration is required.");
      return;
    }

    setIsSubmitting(true);
    let successCount = 0;
    const failIds: string[] = [];

    const pb = createPocketBaseClient();
    const currentUser = pb.authStore.model;
    if (!currentUser) {
      toast.error("User session expired.");
      setIsSubmitting(false);
      return;
    }

    // Upload bulk invoice file once before loop if new file is supplied
    let bulkInvoiceRelationId = "";
    if (bulkInvoiceFileState) {
      try {
        const invoiceFormData = new FormData();
        invoiceFormData.append("file", bulkInvoiceFileState);
        invoiceFormData.append("name", bulkInvoiceFileState.name);
        invoiceFormData.append("invoiceId", generateUniqueInvoiceId(existingInvoices));
        const invoiceRecord = await pb.collection("invoices").create(invoiceFormData);
        bulkInvoiceRelationId = invoiceRecord.id;
      } catch (uploadErr) {
        console.error("Failed to upload bulk invoice file:", uploadErr);
        toast.error("Failed to upload invoice file. Aborting bulk upload.");
        setIsSubmitting(false);
        return;
      }
    } else if (selectedBulkExistingInvoice) {
      const source = assets.find((a) => a.invoiceFile === selectedBulkExistingInvoice);
      if (source && source.invoice) {
        bulkInvoiceRelationId = source.invoice;
      }
    }

    for (const assetId of bulkAssetIds) {
      try {
        // Validate asset_id uniqueness locally
        const isDuplicate = assets.some((a) => a.asset_id.toUpperCase() === assetId.trim().toUpperCase());
        if (isDuplicate) {
          throw new Error(`Asset ID ${assetId} already exists in database.`);
        }

        const formData = new FormData();
        formData.append("asset_id", assetId.trim());
        formData.append("name", `${bulkBrand.trim()} ${bulkModel.trim()}`.trim());
        formData.append("type", bulkType.trim());
        formData.append("brand", bulkBrand.trim());
        formData.append("model", bulkModel.trim());
        formData.append("serialNumber", ""); // serialNumber is optional, leave blank in bulk registration
        formData.append("status", "available");
        formData.append("purchaseDate", bulkPurchaseDate ? new Date(bulkPurchaseDate).toISOString() : "");
        formData.append("purchaseCost", bulkPurchaseCost ? String(parseFloat(bulkPurchaseCost)) : "");
        formData.append("warrantyExpiry", bulkWarrantyExpiry ? new Date(bulkWarrantyExpiry).toISOString() : "");
        formData.append("notes", bulkNotes.trim());

        if (bulkInvoiceRelationId) {
          formData.append("invoice", bulkInvoiceRelationId);
        }

        const record = await pb.collection("assets").create(formData);
        
        await pb.collection("assetHistory").create({
          assetId: record.id,
          changedBy: currentUser.id,
          action: "Create",
          details: "Asset registered via bulk upload mode.",
          date: new Date().toISOString()
        });

        successCount++;
      } catch (err: any) {
        console.warn(`Bulk insert failed for ID ${assetId}:`, err);
        failIds.push(assetId);
      }
    }

    if (successCount > 0) {
      toast.success(`Successfully registered ${successCount} assets.`);
    }
    if (failIds.length > 0) {
      toast.error(`Failed to register ${failIds.length} assets (duplicates or database errors).`);
      setBulkAssetIds(failIds);
    } else {
      setBulkAssetIds([]);
      setShowBulkForm(false);
    }
    
    setIsSubmitting(false);
    void loadData();
  };

  // Sizing Print Labels logic (A4 template dimensions, 3 columns, small cards)
  const handlePrintLabels = () => {
    const selectedAssets = assets.filter((a) => selectedAssetIds.includes(a.id));
    if (selectedAssets.length === 0) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Pop-up blocked. Please enable pop-ups in your browser settings to print labels.");
      return;
    }

    const cardsHtml = selectedAssets
      .map((asset) => {
        return `
          <div class="label-card">
            <span class="label-id">${asset.asset_id}</span>
          </div>
        `;
      })
      .join("");

    printWindow.document.write(`
      <html>
      <head>
        <title>Print Asset Labels</title>
        <style>
          @page {
            size: A4;
            margin: 10mm;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            margin: 0;
            padding: 0;
            background: white;
          }
          .labels-grid {
            display: grid;
            grid-template-columns: repeat(6, 30mm);
            gap: 2mm 3mm;
            justify-content: center;
          }
          .label-card {
            width: 30mm;
            height: 10mm;
            border: 1px solid #000000;
            box-sizing: border-box;
            display: flex;
            align-items: center;
            justify-content: center;
            page-break-inside: avoid;
            overflow: hidden;
            background: white;
            padding: 0;
            margin: 0;
          }
          .label-id {
            font-size: 8pt;
            font-family: monospace;
            font-weight: 700;
            color: #000000;
            text-align: center;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            width: 100%;
          }
          @media print {
            body {
              margin: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="labels-grid">
          ${cardsHtml}
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
              window.close();
            }, 600);
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Rendering Helpers
  const getAssetIcon = (typeStr: string) => {
    const t = typeStr.toLowerCase().trim();
    if (t.includes("laptop") || t.includes("macbook") || t.includes("pc")) {
      return <Laptop className="h-4 w-4" />;
    }
    if (t.includes("phone") || t.includes("mobile") || t.includes("iphone")) {
      return <Smartphone className="h-4 w-4" />;
    }
    if (t.includes("print") || t.includes("epson") || t.includes("canon")) {
      return <Printer className="h-4 w-4" />;
    }
    if (t.includes("mouse") || t.includes("keyboard") || t.includes("peripheral") || t.includes("headset") || t.includes("accessory")) {
      return <Tag className="h-4 w-4" />;
    }
    return <Package className="h-4 w-4" />;
  };

  const getStatusColor = (st: AssetStatus) => {
    switch (st) {
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
      {currentView === "menu" ? (
        <div className="flex h-full min-h-0 flex-col gap-6 animate-fade-in">
          {/* Metrics Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Total Assets</span>
                <span className="text-2xl font-black text-slate-700 mt-1 block">{stats.total}</span>
              </div>
              <div className="p-3 bg-slate-50 text-slate-500 rounded-xl"><Package className="h-5 w-5" /></div>
            </div>
            <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Assigned</span>
                <span className="text-2xl font-black text-blue-600 mt-1 block">{stats.assigned}</span>
              </div>
              <div className="p-3 bg-blue-50 text-blue-500 rounded-xl"><User className="h-5 w-5" /></div>
            </div>
            <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Available</span>
                <span className="text-2xl font-black text-emerald-600 mt-1 block">{stats.available}</span>
              </div>
              <div className="p-3 bg-emerald-50 text-emerald-500 rounded-xl"><CheckCircle className="h-5 w-5" /></div>
            </div>
            <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">In Repair</span>
                <span className="text-2xl font-black text-amber-600 mt-1 block">{stats.maintenance}</span>
              </div>
              <div className="p-3 bg-amber-50 text-amber-500 rounded-xl"><Wrench className="h-5 w-5" /></div>
            </div>
            <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Expiring Soon</span>
                <span className="text-2xl font-black text-amber-500 mt-1 block">{stats.warrantyExpiringSoon}</span>
              </div>
              <div className="p-3 bg-amber-50 text-amber-500 rounded-xl"><Clock className="h-5 w-5" /></div>
            </div>
            <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Expired</span>
                <span className="text-2xl font-black text-rose-600 mt-1 block">{stats.warrantyExpired}</span>
              </div>
              <div className="p-3 bg-rose-50 text-rose-500 rounded-xl"><AlertCircle className="h-5 w-5" /></div>
            </div>
          </div>

          {/* View Selection Cards (Settings style) */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-2">
            {/* Card 1: All Assets */}
            <div
              onClick={() => setCurrentView("all")}
              className="group relative overflow-hidden bg-white border border-blue-100/30 rounded-2xl p-6 shadow-sm hover:shadow-md hover:scale-[1.01] hover:border-blue-100 transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[170px]"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent rounded-bl-full pointer-events-none opacity-50 transition-opacity group-hover:opacity-80 duration-500" />
              <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-blue-500" />
              
              <div className="flex items-start justify-between relative z-10">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-all duration-300">
                  <Package className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50/50 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  {stats.total} Total
                </span>
              </div>

              <div className="relative z-10 mt-4">
                <h4 className="text-sm font-black text-slate-800 group-hover:text-blue-600 transition-colors uppercase tracking-wide">
                  All Assets
                </h4>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  View, register, and manage the complete list of all hardware and assets. Print labels, import bulk stocks, and manage history.
                </p>
              </div>
            </div>

            {/* Card 2: Assigned Assets */}
            <div
              onClick={() => setCurrentView("assigned")}
              className="group relative overflow-hidden bg-white border border-emerald-100/30 rounded-2xl p-6 shadow-sm hover:shadow-md hover:scale-[1.01] hover:border-emerald-100 transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[170px]"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent rounded-bl-full pointer-events-none opacity-50 transition-opacity group-hover:opacity-80 duration-500" />
              <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-emerald-500" />
              
              <div className="flex items-start justify-between relative z-10">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-all duration-300">
                  <UserCheck className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50/50 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  {stats.assigned} Deployed
                </span>
              </div>

              <div className="relative z-10 mt-4">
                <h4 className="text-sm font-black text-slate-800 group-hover:text-emerald-600 transition-colors uppercase tracking-wide">
                  Assigned Assets
                </h4>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  List of all checked out hardware currently assigned to active company operators. View who holds each asset.
                </p>
              </div>
            </div>

            {/* Card 3: Available Assets */}
            <div
              onClick={() => setCurrentView("available")}
              className="group relative overflow-hidden bg-white border border-indigo-100/30 rounded-2xl p-6 shadow-sm hover:shadow-md hover:scale-[1.01] hover:border-indigo-100 transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[170px]"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-transparent rounded-bl-full pointer-events-none opacity-50 transition-opacity group-hover:opacity-80 duration-500" />
              <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-indigo-500" />
              
              <div className="flex items-start justify-between relative z-10">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
                  <CheckCircle className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50/50 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  {stats.available} Available
                </span>
              </div>

              <div className="relative z-10 mt-4">
                <h4 className="text-sm font-black text-slate-800 group-hover:text-indigo-600 transition-colors uppercase tracking-wide">
                  Available Assets
                </h4>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  List of all stock hardware available in storage and ready for deployment. Fast assignment controls.
                </p>
              </div>
            </div>

            {/* Card 4: Purchase Invoices */}
            <div
              onClick={() => setCurrentView("invoices")}
              className="group relative overflow-hidden bg-white border border-amber-100/30 rounded-2xl p-6 shadow-sm hover:shadow-md hover:scale-[1.01] hover:border-amber-100 transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[170px]"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent rounded-bl-full pointer-events-none opacity-50 transition-opacity group-hover:opacity-80 duration-500" />
              <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-amber-500" />
              
              <div className="flex items-start justify-between relative z-10">
                <div className="p-3 bg-amber-50 text-amber-600 rounded-xl group-hover:bg-amber-600 group-hover:text-white transition-all duration-300">
                  <FileText className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50/50 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  {existingInvoices.length} Unique
                </span>
              </div>

              <div className="relative z-10 mt-4">
                <h4 className="text-sm font-black text-slate-800 group-hover:text-amber-600 transition-colors uppercase tracking-wide">
                  Purchase Invoices
                </h4>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  Browse uploaded PDF and image invoice receipts. Track which assets reference each invoice sheet in a relational view.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col gap-6 animate-fade-in">
          {/* Detailed View Breadcrumbs */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCurrentView("menu")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-600 shadow-sm transition-all"
              >
                <ChevronLeft className="h-4 w-4" /> Back to Dashboard
              </button>
              <span className="text-slate-300">|</span>
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">
                {currentView === "all" ? "All Registered Assets" : currentView === "assigned" ? "Assigned Deployed Stock" : currentView === "invoices" ? "Purchase Invoices Registry" : "Available Storage Inventory"}
              </h3>
            </div>
          </div>

          {/* Section Headers & Filters */}
          <>
              {/* Filters Panel */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="space-y-1.5 md:col-span-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Search</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      value={currentView === "invoices" ? invoiceSearch : searchTerm}
                      onChange={(e) => currentView === "invoices" ? setInvoiceSearch(e.target.value) : setSearchTerm(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:border-blue-500 focus:outline-none transition-all"
                      placeholder={
                        currentView === "invoices"
                          ? "Search Invoice ID, filename..."
                          : currentView === "all"
                          ? "Search Asset ID, brand, assignee..."
                          : currentView === "assigned"
                          ? "Search assigned assets..."
                          : "Search available stock..."
                      }
                    />
                  </div>
                </div>
                {currentView !== "invoices" ? (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Type</label>
                      <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none transition-all capitalize"
                      >
                        <option value="all">All Types</option>
                        {allTypes.map((t) => (
                          <option key={t} value={t}>{t}s</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Status</label>
                      {currentView === "all" ? (
                        <select
                          value={statusFilter}
                          onChange={(e) => setStatusFilter(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none transition-all"
                        >
                          <option value="all">All Statuses</option>
                          <option value="available">Available</option>
                          <option value="assigned">Assigned</option>
                          <option value="maintenance">Maintenance</option>
                          <option value="retired">Retired</option>
                        </select>
                      ) : (
                        <div className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500 font-semibold capitalize">
                          {currentView}
                        </div>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Warranty</label>
                      <select
                        value={warrantyFilter}
                        onChange={(e) => setWarrantyFilter(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none transition-all"
                      >
                        <option value="all">All Warranties</option>
                        <option value="active">Active / Unspecified</option>
                        <option value="expiring_soon">Expiring Soon (30d)</option>
                        <option value="expired">Expired</option>
                      </select>
                    </div>
                  </>
                ) : (
                  <div className="md:col-span-3 flex flex-col justify-end" />
                )}
              </div>

              {/* Action buttons row */}
              <div className="flex justify-between items-center bg-slate-50/50 p-4 border border-slate-100 rounded-2xl">
                <span className="text-xs font-bold text-slate-400">
                  {currentView === "invoices"
                    ? `Invoices count: ${filteredInvoicesList.length} total unique documents`
                    : currentView === "all"
                    ? `Registry count: ${currentFilteredList.length} total items`
                    : currentView === "assigned"
                    ? `Assigned count: ${currentFilteredList.length} items deployed`
                    : `Available count: ${currentFilteredList.length} items in storage`
                  }
                </span>
                <div className="flex items-center gap-2">
                  {currentView !== "invoices" && (
                    <>
                      <button
                        onClick={openBulkAddForm}
                        className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-white hover:bg-slate-900 shadow-sm transition-all uppercase tracking-wider"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Bulk Add Stocks
                      </button>
                      <button
                        onClick={openCreateForm}
                        className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 shadow-sm transition-all uppercase tracking-wider"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Register Asset
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => void loadData()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 shadow-sm transition-all"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Refresh
                  </button>
                </div>
              </div>
            </>

          {/* Selection Action Bar for printing labels */}
          {selectedAssetIds.length > 0 && (
            <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-2xl px-5 py-3.5 animate-fade-in shadow-sm">
              <div className="flex items-center gap-3">
                <span className="text-xs font-extrabold text-blue-700 uppercase tracking-wider">
                  {selectedAssetIds.length} Asset(s) Selected
                </span>
                <button
                  onClick={() => setSelectedAssetIds([])}
                  className="text-xs text-blue-500 hover:text-blue-700 hover:underline font-bold"
                >
                  Clear Selection
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowBulkInvoiceModal(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-blue-700 hover:bg-slate-50 shadow-sm transition-all animate-none"
                >
                  <UploadCloud className="h-3.5 w-3.5" />
                  Assign Invoice
                </button>
                <button
                  onClick={handlePrintLabels}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-blue-700 shadow-sm transition-all"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print Labels
                </button>
              </div>
            </div>
          )}

          {/* Assets Grid Card list container */}
          <div className="flex-1 overflow-y-auto min-h-0 pr-1">
            {isLoading ? (
              <div className="flex items-center justify-center h-48">
                <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
              </div>
            ) : currentView === "invoices" ? (
              <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
                <div className="overflow-x-auto flex-1">
                  {filteredInvoicesList.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 gap-2">
                      <FileText className="h-8 w-8 text-slate-300" />
                      <span className="text-sm font-semibold text-slate-500">No invoices found</span>
                      <span className="text-xs text-slate-400">Try adjusting your search query.</span>
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-bold uppercase tracking-wider text-slate-400">
                          <th className="px-6 py-4">Invoice ID</th>
                          <th className="px-6 py-4">Date Uploaded</th>
                          <th className="px-6 py-4">Linked Assets</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                        {paginatedInvoices.map((inv) => {
                          const pb = createPocketBaseClient();
                          const token = pb.authStore.token;
                          const suffix = token ? `?token=${token}` : "";
                          const fileUrl = `${pocketBaseUrl}/api/files/invoices/${inv.id}/${inv.filename}${suffix}`;
                          return (
                            <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4">
                                <button
                                  onClick={() => setPreviewInvoice(inv)}
                                  className="font-mono font-bold text-xs text-blue-600 hover:text-blue-800 hover:underline text-left focus:outline-none"
                                >
                                  {inv.invoiceId || "INV-UNKNOWN"}
                                </button>
                              </td>
                              <td className="px-6 py-4 text-xs text-slate-400">
                                {formatDate(inv.created)}
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-xs font-bold text-slate-700">
                                    {inv.linkedAssets.length} asset{inv.linkedAssets.length !== 1 ? "s" : ""}
                                  </span>
                                  {inv.linkedAssets.length > 0 && (
                                    <span className="text-[10px] text-slate-400 font-semibold truncate max-w-[200px]" title={inv.linkedAssets.map((a: any) => a.asset_id).join(", ")}>
                                      {inv.linkedAssets.map((a: any) => a.asset_id).join(", ")}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => setPreviewInvoice(inv)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50/50 transition-all"
                                    title="Preview Invoice"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </button>
                                  <a
                                    href={fileUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50/50 transition-all inline-block animate-none"
                                    title="Open Original File"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </a>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
                <div className="overflow-x-auto flex-1">
                  {viewAssets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 gap-2">
                      <Package className="h-8 w-8 text-slate-300" />
                      <span className="text-sm font-semibold text-slate-500">No assets found</span>
                      <span className="text-xs text-slate-400">Try adjusting your search or filters.</span>
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-bold uppercase tracking-wider text-slate-400">
                          <th className="px-6 py-4 w-10">
                            <input
                              type="checkbox"
                              checked={isAllSelected}
                              onChange={(e) => handleToggleSelectAll(e.target.checked)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/20 h-3.5 w-3.5"
                            />
                          </th>
                          <th className="px-6 py-4">Asset Details</th>
                          <th className="px-6 py-4">Brand / Model</th>
                          <th className="px-6 py-4">Category</th>
                          <th className="px-6 py-4">Status</th>
                          {currentView !== "available" && <th className="px-6 py-4">Assignee</th>}
                          <th className="px-6 py-4">Warranty</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                        {viewAssets.map((asset) => {
                          const warrantyInfo = getWarrantyStatus(asset.warrantyExpiry);
                          const isSelected = selectedAssetIds.includes(asset.id);
                          return (
                            <tr 
                              key={asset.id} 
                              className={`hover:bg-slate-50/50 transition-colors ${
                                isSelected ? "bg-blue-50/10" : ""
                              }`}
                            >
                              <td className="px-6 py-4 w-10">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setSelectedAssetIds((prev) => {
                                      if (checked) {
                                        return [...prev, asset.id];
                                      } else {
                                        return prev.filter((id) => id !== asset.id);
                                      }
                                    });
                                  }}
                                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/20 h-3.5 w-3.5"
                                />
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="p-2 bg-slate-50 rounded-lg text-slate-500">
                                    {getAssetIcon(asset.type)}
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="font-mono font-bold text-xs text-blue-600 select-all">{asset.asset_id}</span>
                                    <span className="text-xs text-slate-400 font-medium max-w-[180px] truncate" title={asset.name}>
                                      {asset.name}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className="font-bold text-slate-800 text-xs block">{asset.brand}</span>
                                {asset.model && <span className="text-[10px] text-slate-400 block">{asset.model}</span>}
                                {asset.serialNumber && asset.serialNumber !== asset.asset_id && (
                                  <span className="text-[9px] text-slate-400 font-mono block mt-0.5">S/N: {asset.serialNumber}</span>
                                )}
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-xs text-slate-500 capitalize font-medium">{asset.type}</span>
                              </td>
                              <td className="px-6 py-4">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border capitalize ${getStatusColor(asset.status)}`}>
                                  {asset.status}
                                </span>
                              </td>
                              {currentView !== "available" && (
                                <td className="px-6 py-4">
                                  {asset.status === "assigned" ? (
                                    <span 
                                      className={`font-bold text-xs truncate max-w-[140px] block ${asset.assignedLocation ? 'text-blue-700' : 'text-slate-700'}`} 
                                      title={asset.assignedLocation || asset.assignedToName || "Assigned"}
                                    >
                                      {asset.assignedLocation || asset.assignedToName || "Assigned"}
                                    </span>
                                  ) : (
                                    <span className="text-slate-300">-</span>
                                  )}
                                </td>
                              )}
                              <td className="px-6 py-4">
                                <div>
                                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium border ${warrantyInfo.color}`}>
                                    {warrantyInfo.text}
                                  </span>
                                  {asset.warrantyExpiry && (
                                    <span className="text-slate-400 block text-[9px] mt-0.5">
                                      Exp: {formatDate(asset.warrantyExpiry)}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => setViewAsset(asset)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all"
                                    title="View History Log"
                                  >
                                    <History className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => openQuickAssign(asset)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50/50 transition-all"
                                    title="Quick Assign"
                                  >
                                    <UserPlus className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => openEditForm(asset)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50/50 transition-all"
                                    title="Edit Details"
                                  >
                                    <Edit className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setDeleteAssetId(asset.id);
                                      setDeleteDialogOpen(true);
                                    }}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50/50 transition-all"
                                    title="Delete Asset"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
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
              </div>
            )}
          </div>

          {/* Pagination controls */}
          {currentView === "invoices" ? (
            filteredInvoicesList.length > 0 && (
              <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/30 px-6 py-4 rounded-2xl">
                <span className="text-xs font-semibold text-slate-400">
                  Page {invoicePage} of {totalInvoicePages}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    disabled={invoicePage === 1}
                    onClick={() => setInvoicePage(invoicePage - 1)}
                    className="p-2 border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 rounded-lg text-slate-500 shadow-sm transition-all"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    disabled={invoicePage === totalInvoicePages}
                    onClick={() => setInvoicePage(invoicePage + 1)}
                    className="p-2 border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 rounded-lg text-slate-500 shadow-sm transition-all"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )
          ) : (
            currentFilteredList.length > 0 && (
              <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/30 px-6 py-4 rounded-2xl">
                <span className="text-xs font-semibold text-slate-400">
                  Page {page} of {totalPages}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                    className="p-2 border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 rounded-lg text-slate-500 shadow-sm transition-all"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    disabled={page === totalPages}
                    onClick={() => setPage(page + 1)}
                    className="p-2 border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 rounded-lg text-slate-500 shadow-sm transition-all"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* Invoice Preview Modal */}
      {previewInvoice && (() => {
        const fileUrl = `/api/admin/invoices/preview?id=${previewInvoice.id}&file=${previewInvoice.filename}`;
        const isPdf = previewInvoice.filename.toLowerCase().endsWith(".pdf");
        const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(previewInvoice.filename);
        
        return (
          <div className="fixed inset-0 z-55 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
            <div className="w-full max-w-5xl bg-white rounded-3xl shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] overflow-hidden">
              {/* Header */}
              <header className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <div>
                    <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider">
                      Invoice: {previewInvoice.invoiceId || "INV-UNKNOWN"}
                    </h3>
                    <span className="text-[10px] text-slate-400 font-semibold block mt-0.5">
                      Uploaded on {formatDate(previewInvoice.created)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setPreviewInvoice(null)}
                  className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all"
                >
                  <X className="h-5 w-5" />
                </button>
              </header>

              {/* Grid content */}
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 min-h-0 overflow-y-auto bg-slate-50/30">
                {/* Left Side: Invoice Preview Document */}
                <div className="lg:col-span-8 flex flex-col gap-3 min-h-0 h-full">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Document Preview</span>
                  <div className="flex-1 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-inner flex items-center justify-center min-h-[50vh]">
                    {isPdf ? (
                      <iframe
                        src={`${fileUrl}#toolbar=0&navpanes=0`}
                        className="w-full h-full min-h-[50vh] border-0"
                        title="Invoice PDF"
                      />
                    ) : isImage ? (
                      <div className="p-4 overflow-auto max-h-[50vh] w-full flex items-center justify-center">
                        <img
                          src={fileUrl}
                          className="max-w-full max-h-[48vh] object-contain rounded-xl"
                          alt="Invoice Preview"
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center p-8 text-center">
                        <FileText className="h-16 w-16 text-slate-300" />
                        <span className="mt-3 text-sm font-bold text-slate-500">{previewInvoice.filename}</span>
                        <a
                          href={fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-4.5 py-2 text-xs font-bold text-white shadow-sm transition-all"
                        >
                          <ExternalLink className="h-4 w-4" /> Open File
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Side: Associated Assets */}
                <div className="lg:col-span-4 flex flex-col gap-3 min-h-0 h-full">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                    Associated Assets ({previewInvoice.linkedAssets.length})
                  </span>
                  <div className="flex-1 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm overflow-y-auto space-y-3 min-h-[30vh]">
                    {previewInvoice.linkedAssets.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full py-8 text-center text-slate-400">
                        <Package className="h-8 w-8 text-slate-200 mb-2" />
                        <span className="text-xs font-bold">No assets associated with this invoice.</span>
                      </div>
                    ) : (
                      previewInvoice.linkedAssets.map((asset: any) => {
                        const statusColor = getStatusColor(asset.status);
                        return (
                          <div
                            key={asset.id}
                            className="p-3 border border-slate-100 hover:border-slate-200 rounded-xl bg-slate-50/50 hover:bg-slate-50 transition-all flex flex-col gap-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono font-bold text-[11px] text-blue-600 select-all">
                                {asset.asset_id}
                              </span>
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border capitalize ${statusColor}`}>
                                {asset.status}
                              </span>
                            </div>
                            <div>
                              <span className="font-bold text-slate-800 text-xs block">
                                {asset.brand} {asset.model}
                              </span>
                              {asset.serialNumber && asset.serialNumber !== asset.asset_id && (
                                <span className="font-mono text-[10px] text-slate-400 block mt-0.5">
                                  S/N: {asset.serialNumber}
                                </span>
                              )}
                              {asset.assignedLocation || asset.assignedToName ? (
                                <span className={`text-[10px] font-bold block mt-1 ${asset.assignedLocation ? 'text-blue-700' : 'text-slate-600'}`}>
                                  Holder: {asset.assignedLocation || asset.assignedToName}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Create / Edit Form Modal Drawer */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-slate-100 flex flex-col max-h-[90vh]">
            <header className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider">
                {editingAssetId ? "Update Asset Record" : "Register New Asset"}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all font-bold text-lg leading-none"
              >
                &times;
              </button>
            </header>
            <form onSubmit={(e) => void handleSubmit(e)} className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Asset ID / Tag *</label>
                  <input
                    readOnly
                    required
                    value={assetIdInput}
                    placeholder="Auto-generated"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500 focus:outline-none transition-all font-mono cursor-not-allowed select-all font-bold"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Asset Type *</label>
                  {!isCustomType ? (
                    <select
                      value={type}
                      onChange={(e) => {
                        if (e.target.value === "custom") {
                          setIsCustomType(true);
                          setType("");
                        } else {
                          setType(e.target.value);
                        }
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none transition-all capitalize"
                    >
                      {allTypes.map((t) => (
                        <option key={t} value={t}>{t}s</option>
                      ))}
                      <option value="custom">+ Add Custom Type...</option>
                    </select>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        required
                        value={type}
                        onChange={(e) => setType(e.target.value)}
                        placeholder="e.g. tablet, UPS, screen"
                        className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomType(false);
                          setType("laptop");
                        }}
                        className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3 text-xs font-bold text-slate-500 transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Brand *</label>
                  <input
                    required
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    placeholder="e.g. Apple, Dell, Epson"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Model</label>
                  <input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="e.g. M3 Pro, L3150"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Manufacturer Serial Number</label>
                  <div className="relative">
                    <input
                      value={serialNumber}
                      onChange={(e) => setSerialNumber(e.target.value)}
                      placeholder="Optional"
                      className="w-full rounded-xl border border-slate-200 bg-white pl-4 pr-10 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none transition-all font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setScannerTarget("serialNumber");
                        setShowScanner(true);
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all"
                      title="Scan Serial Number"
                    >
                      <QrCode className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Status *</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as AssetStatus)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none transition-all"
                  >
                    <option value="available">Available</option>
                    <option value="assigned">Assigned</option>
                    <option value="maintenance">Maintenance/Repair</option>
                    <option value="retired">Retired</option>
                  </select>
                </div>

                {status === "assigned" && (
                  <div className="space-y-4 md:col-span-2 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Assign To:</span>
                      <label className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold cursor-pointer">
                        <input
                          type="radio"
                          name="assignmentType"
                          value="user"
                          checked={assignmentType === "user"}
                          onChange={() => setAssignmentType("user")}
                          className="text-blue-600 focus:ring-blue-500/20"
                        />
                        Staff Member
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold cursor-pointer">
                        <input
                          type="radio"
                          name="assignmentType"
                          value="location"
                          checked={assignmentType === "location"}
                          onChange={() => setAssignmentType("location")}
                          className="text-blue-600 focus:ring-blue-500/20"
                        />
                        Location
                      </label>
                    </div>

                    {assignmentType === "user" ? (
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">Assign to Staff Member *</label>
                        <select
                          required
                          value={assignedTo}
                          onChange={(e) => {
                            setPage(1);
                            setAssignedTo(e.target.value);
                          }}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none transition-all"
                        >
                          <option value="">-- Select a User --</option>
                          {users.filter(u => u.accountStatus !== "disabled" || u.id === assignedTo).map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.name} ({user.email || "No email"}) {user.accountStatus === "disabled" ? " (Inactive)" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">Location Name *</label>
                        <input
                          required
                          type="text"
                          value={assignedLocation}
                          onChange={(e) => setAssignedLocation(e.target.value)}
                          placeholder="e.g. Conference Room A, Reception Desk"
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none transition-all font-semibold"
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Purchase Date</label>
                  <input
                    type="date"
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Purchase Cost ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={purchaseCost}
                    onChange={(e) => setPurchaseCost(e.target.value)}
                    placeholder="e.g. 1499.00"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none transition-all"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Warranty Expiry Date</label>
                  <input
                    type="date"
                    value={warrantyExpiry}
                    onChange={(e) => setWarrantyExpiry(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none transition-all"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Purchase Invoice File</label>
                  {existingInvoice && !removeInvoice ? (
                    <div className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs">
                      <span className="text-slate-600 truncate font-semibold">Attached: {existingInvoice}</span>
                      <button
                        type="button"
                        onClick={() => setRemoveInvoice(true)}
                        className="text-rose-500 hover:text-rose-700 font-bold"
                      >
                        Remove Attachment
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <span className="text-[10px] text-slate-400 font-semibold block mb-1">Upload New File</span>
                        <input
                          type="file"
                          accept="application/pdf,image/*"
                          onChange={(e) => {
                            setInvoiceFileState(e.target.files?.[0] || null);
                            if (e.target.files?.[0]) setSelectedExistingInvoice("");
                          }}
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none transition-all"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-semibold block mb-1">Or Choose Previously Added Invoice</span>
                        <select
                          value={selectedExistingInvoice}
                          onChange={(e) => {
                            setSelectedExistingInvoice(e.target.value);
                            if (e.target.value) setInvoiceFileState(null);
                          }}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none transition-all text-ellipsis overflow-hidden"
                        >
                          <option value="">-- Choose Existing Invoice --</option>
                          {existingInvoices.map((inv) => (
                            <option key={inv.filename} value={inv.filename}>
                              {inv.invoiceId ? `[${inv.invoiceId}] ` : ""}{inv.filename.split("_").slice(2).join("_") || inv.filename} ({inv.assetName})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Configuration Notes / Remarks</label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Provide memory configurations, setup commands, or issue history..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none transition-all resize-none"
                  />
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 font-sans">
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
                  {editingAssetId ? "Save Modifications" : "Register Item"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Registration Modal Form */}
      {showBulkForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-slate-100 flex flex-col max-h-[90vh]">
            <header className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider">
                Bulk Asset Ingestion Wizard
              </h3>
              <button
                onClick={() => setShowBulkForm(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all font-bold text-lg leading-none"
              >
                &times;
              </button>
            </header>
            
            <form onSubmit={(e) => void handleBulkSubmit(e)} className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Common Specifications */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1.5">
                  Common Hardware Specifications
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Brand *</label>
                    <input
                      required
                      value={bulkBrand}
                      onChange={(e) => setBulkBrand(e.target.value)}
                      placeholder="e.g. Dell, Logitech"
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Model</label>
                    <input
                      value={bulkModel}
                      onChange={(e) => setBulkModel(e.target.value)}
                      placeholder="e.g. SE2422H, K120"
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Type *</label>
                    {!isBulkCustomType ? (
                      <select
                        value={bulkType}
                        onChange={(e) => {
                          if (e.target.value === "custom") {
                            setIsBulkCustomType(true);
                            setBulkType("");
                          } else {
                            setBulkType(e.target.value);
                          }
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none transition-all capitalize"
                      >
                        {allTypes.map((t) => (
                          <option key={t} value={t}>{t}s</option>
                        ))}
                        <option value="custom">+ Add Custom Type...</option>
                      </select>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          required
                          value={bulkType}
                          onChange={(e) => setBulkType(e.target.value)}
                          placeholder="e.g. keyboard, mouse"
                          className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setIsBulkCustomType(false);
                            setBulkType("laptop");
                          }}
                          className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3 text-xs font-bold text-slate-500 transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Purchase Date</label>
                    <input
                      type="date"
                      value={bulkPurchaseDate}
                      onChange={(e) => setBulkPurchaseDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Purchase Cost ($ per item)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={bulkPurchaseCost}
                      onChange={(e) => setBulkPurchaseCost(e.target.value)}
                      placeholder="e.g. 19.99"
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Warranty Expiry</label>
                    <input
                      type="date"
                      value={bulkWarrantyExpiry}
                      onChange={(e) => setBulkWarrantyExpiry(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none transition-all"
                    />
                  </div>
                  
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Common Invoice File</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <span className="text-[10px] text-slate-400 font-semibold block mb-1">Upload New File</span>
                        <input
                          type="file"
                          accept="application/pdf,image/*"
                          onChange={(e) => {
                            setBulkInvoiceFileState(e.target.files?.[0] || null);
                            if (e.target.files?.[0]) setSelectedBulkExistingInvoice("");
                          }}
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none transition-all"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-semibold block mb-1">Or Choose Previously Added Invoice</span>
                        <select
                          value={selectedBulkExistingInvoice}
                          onChange={(e) => {
                            setSelectedBulkExistingInvoice(e.target.value);
                            if (e.target.value) setBulkInvoiceFileState(null);
                          }}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none transition-all text-ellipsis overflow-hidden"
                        >
                          <option value="">-- Choose Existing Invoice --</option>
                          {existingInvoices.map((inv) => (
                            <option key={inv.filename} value={inv.filename}>
                              {inv.invoiceId ? `[${inv.invoiceId}] ` : ""}{inv.filename.split("_").slice(2).join("_") || inv.filename} ({inv.assetName})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Common Notes / Details</label>
                    <textarea
                      rows={2}
                      value={bulkNotes}
                      onChange={(e) => setBulkNotes(e.target.value)}
                      placeholder="e.g. Batch ordered from Amazon..."
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none transition-all resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Unique Asset Tag Input Section */}
              <div className="space-y-4 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Unique Asset Tags / ID List
                  </h4>
                  <div className="flex items-center gap-4 text-xs">
                    <label className="flex items-center gap-1.5 font-bold text-slate-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isContinuousScan}
                        onChange={(e) => setIsContinuousScan(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
                      />
                      Continuous Scan
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setScannerTarget("bulk");
                        setShowScanner(true);
                      }}
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-bold"
                    >
                      <QrCode className="h-3.5 w-3.5" /> Start Scanning
                    </button>
                  </div>
                </div>

                 {/* Parsing & Generating Controls */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Manual Input */}
                  <div className="flex gap-2">
                    <input
                      value={bulkManualInput}
                      onChange={(e) => setBulkManualInput(e.target.value)}
                      placeholder="Enter or paste Asset IDs (comma or line separated)"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleParseManualIds();
                        }
                      }}
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs text-slate-700 focus:border-blue-500 focus:outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={handleParseManualIds}
                      className="rounded-xl bg-slate-800 hover:bg-slate-900 px-3 py-2 text-xs font-bold text-white transition-all shadow-sm shrink-0"
                    >
                      Add IDs
                    </button>
                  </div>

                  {/* Auto-generator Panel */}
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={bulkGenQty}
                      onChange={(e) => setBulkGenQty(e.target.value)}
                      placeholder="Qty"
                      className="w-16 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-blue-500 focus:outline-none transition-all text-center"
                    />
                    <button
                      type="button"
                      onClick={handleBulkGenerateIds}
                      className="flex-1 rounded-xl bg-blue-600 hover:bg-blue-700 px-3 py-2 text-xs font-bold text-white transition-all shadow-sm shrink-0"
                    >
                      Auto-Generate IDs
                    </button>
                  </div>
                </div>

                {/* List builder view */}
                <div className="border border-slate-100 bg-slate-50/50 rounded-xl p-3 overflow-y-auto max-h-[160px] min-h-[110px] space-y-1">
                  {bulkAssetIds.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 py-6">
                      <Tag className="h-7 w-7 text-slate-300 mb-1" />
                      <span className="text-[10px]">No unique Asset IDs added yet.</span>
                      <span className="text-[9px] text-slate-300">Scan tag barcodes or paste them above.</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {bulkAssetIds.map((id, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-white border border-slate-100 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 shadow-sm font-mono">
                          <input
                            value={id}
                            onChange={(e) => {
                              const newval = e.target.value;
                              setBulkAssetIds((prev) =>
                                prev.map((x, i) => (i === idx ? newval : x))
                              );
                            }}
                            className="text-xs text-slate-700 bg-transparent border-none focus:outline-none w-full mr-2"
                          />
                          <button
                            type="button"
                            onClick={() => setBulkAssetIds((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-slate-400 hover:text-rose-500 p-0.5 rounded font-bold text-sm leading-none ml-1 shrink-0"
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Submit / Cancel Actions */}
                <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 font-sans">
                  <button
                    type="button"
                    onClick={() => setShowBulkForm(false)}
                    className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-5 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || bulkAssetIds.length === 0}
                    className="rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all flex items-center gap-1.5"
                  >
                    {isSubmitting && <RefreshCw className="h-4 w-4 animate-spin" />}
                    Submit {bulkAssetIds.length > 0 && `(${bulkAssetIds.length} Stock)`}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Alert Dialog */}
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

      {/* Quick Assign Dialog Modal */}
      {assignAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col animation-fade-in">
            <header className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-blue-500" />
                Assign Asset
              </h3>
              <button
                onClick={() => setAssignAsset(null)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none font-bold"
              >
                &times;
              </button>
            </header>
            
            <form onSubmit={(e) => void handleQuickAssignSubmit(e)} className="p-6 space-y-4">
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Asset to Assign</span>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">{assignAsset.name}</span>
                  <span className="text-[11px] font-mono font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase tracking-wide">
                    {assignAsset.asset_id}
                  </span>
                </div>
                <div className="text-xs text-slate-400 flex items-center gap-1.5">
                  <span>{assignAsset.brand}</span>
                  {assignAsset.model && (
                    <>
                      <span className="text-slate-300">•</span>
                      <span>{assignAsset.model}</span>
                    </>
                  )}
                </div>
              </div>

               <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Assign To:</span>
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold cursor-pointer">
                    <input
                      type="radio"
                      name="quickAssignType"
                      value="user"
                      checked={quickAssignType === "user"}
                      onChange={() => setQuickAssignType("user")}
                      className="text-blue-600 focus:ring-blue-500/20"
                    />
                    Staff Member
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold cursor-pointer">
                    <input
                      type="radio"
                      name="quickAssignType"
                      value="location"
                      checked={quickAssignType === "location"}
                      onChange={() => setQuickAssignType("location")}
                      className="text-blue-600 focus:ring-blue-500/20"
                    />
                    Location
                  </label>
                </div>

                {quickAssignType === "user" ? (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">Select Assignee *</label>
                    <select
                      value={assignUserId}
                      onChange={(e) => setAssignUserId(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none transition-all"
                    >
                      <option value="">-- Select a User / Unassign --</option>
                      {users.filter(u => u.accountStatus !== "disabled" || u.id === assignAsset.assignedTo).map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name} ({user.email || "No email"}) {user.accountStatus === "disabled" ? " (Inactive)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">Location Name *</label>
                    <input
                      type="text"
                      value={quickAssignLocation}
                      onChange={(e) => setQuickAssignLocation(e.target.value)}
                      placeholder="e.g. Conference Room A, Reception Desk"
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none transition-all font-semibold"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAssignAsset(null)}
                  className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAssigning}
                  className="rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-5 py-2 text-sm font-semibold text-white transition-all shadow-sm flex items-center gap-1.5 animate-none"
                >
                  {isAssigning && <RefreshCw className="h-4 w-4 animate-spin" />}
                  Save Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Asset Detail / History timeline Drawer */}
      {viewAsset && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col animate-slide-in">
            <header className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                  {getAssetIcon(viewAsset.type)}
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wide">{viewAsset.brand} {viewAsset.model}</h3>
                  <span className="text-xs text-slate-400 capitalize">{viewAsset.name}</span>
                </div>
              </div>
              <button
                onClick={() => setViewAsset(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all font-bold text-lg leading-none"
              >
                &times;
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Asset Technical Specifications */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Technical Specifications</h4>
                <div className="grid grid-cols-2 gap-4 text-xs border border-slate-100 rounded-2xl p-4 bg-slate-50/30">
                  <div>
                    <span className="text-slate-400 font-semibold block">Asset Tag ID</span>
                    <span className="text-blue-600 font-mono text-[11px] font-bold select-all">{viewAsset.asset_id}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold block">Manufacturer S/N</span>
                    <span className="text-slate-700 font-mono text-[11px] font-bold select-all">{viewAsset.serialNumber || "None"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold block">Status</span>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] mt-0.5 font-bold border capitalize ${getStatusColor(viewAsset.status)}`}>
                      {viewAsset.status}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold block">Asset Category</span>
                    <span className="text-slate-700 font-semibold block capitalize mt-0.5">{viewAsset.type}</span>
                  </div>
                  {viewAsset.status === "assigned" && (
                    <div className="col-span-2 border-t border-slate-100 pt-2 mt-1">
                      <span className="text-slate-400 font-semibold block">Current Assignee</span>
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
                  {viewAsset.invoiceFile && (
                    <div className="col-span-2 border-t border-slate-100 pt-2 mt-1">
                      <span className="text-slate-400 font-semibold block">Purchase Invoice</span>
                      <a
                        href={getInvoiceFileUrl(viewAsset)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 shadow-sm mt-1.5 transition-all"
                      >
                        <FileText className="h-3.5 w-3.5 text-blue-500" />
                        View Invoice Attachment ({viewAsset.invoiceFilename || viewAsset.invoiceFile.split("_").slice(2).join("_") || "Download"})
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Assignment Audit logs history timeline */}
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
                        <div className="absolute -left-[21.5px] top-1 bg-white border border-slate-200 p-0.5 rounded-full text-slate-400">
                          <div className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span className="font-bold uppercase tracking-wider text-blue-600">{log.action}</span>
                          <span>{formatDate(log.date)}</span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">{log.details}</p>
                        <span className="text-[9px] text-slate-400 block mt-0.5">By: {log.changedByName}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <footer className="px-6 py-4 border-t border-slate-100 flex justify-end bg-slate-50/50">
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

      {/* Bulk Invoice Assignment Modal */}
      {showBulkInvoiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col animation-fade-in">
            <header className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <UploadCloud className="h-5 w-5 text-blue-500" />
                Assign Invoice
              </h3>
              <button
                onClick={() => {
                  setShowBulkInvoiceModal(false);
                  setBulkInvoiceFile(null);
                }}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none font-bold"
              >
                &times;
              </button>
            </header>
            
            <form onSubmit={(e) => void handleBulkAssignInvoice(e)} className="p-6 space-y-4">
              <p className="text-xs text-slate-500">
                Upload a purchase invoice (PDF or Image) to assign it to all {selectedAssetIds.length} selected assets simultaneously.
              </p>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Select Invoice File *</label>
                <input
                  required
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => setBulkInvoiceFile(e.target.files?.[0] || null)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none transition-all"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 font-sans">
                <button
                  type="button"
                  onClick={() => {
                    setShowBulkInvoiceModal(false);
                    setBulkInvoiceFile(null);
                  }}
                  className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAssigningInvoice || !bulkInvoiceFile}
                  className="rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-5 py-2 text-sm font-semibold text-white transition-all shadow-sm flex items-center gap-1.5"
                >
                  {isAssigningInvoice && <RefreshCw className="h-4 w-4 animate-spin" />}
                  Assign Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Camera scan barcode/QR code overlay */}
      {showScanner && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center">
            <div className="flex justify-between items-center w-full mb-2">
              {devices.length > 1 && (
                <button
                  type="button"
                  onClick={handleSwitchCamera}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-all"
                  title="Rotate/Switch Camera"
                >
                  <RefreshCw className="h-4.5 w-4.5" />
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={() => setShowScanner(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition-all font-bold text-lg leading-none"
              >
                &times;
              </button>
            </div>
            <div className="text-center mb-5">
              <h3 className="font-extrabold text-white text-sm flex items-center justify-center gap-1.5 uppercase tracking-wider">
                <QrCode className="h-5 w-5 text-blue-500" />
                Scan Code
              </h3>
              <p className="text-[10px] text-slate-400 mt-1">
                Position code inside scanner frame. Continuous scanning beep is enabled.
              </p>
              {devices.length > 1 && (
                <p className="text-[9px] text-blue-500 font-semibold mt-1">
                  Camera: {devices[activeDeviceIndex]?.label || `Camera ${activeDeviceIndex + 1}`}
                </p>
              )}
            </div>
            
            <div className="w-full aspect-square max-w-[280px] rounded-2xl overflow-hidden bg-slate-950 relative border border-slate-800 shadow-inner flex items-center justify-center">
              <div id="qr-reader-target" className="w-full h-full" />
              <div className="absolute left-6 right-6 top-[30%] bottom-[30%] border border-emerald-500/70 rounded-xl pointer-events-none">
                <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-emerald-400 rounded-tl" />
                <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-emerald-400 rounded-tr" />
                <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-emerald-400 rounded-bl" />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-emerald-400 rounded-br" />
                <div className="absolute left-0 right-0 h-0.5 bg-emerald-400 top-1/2 -translate-y-1/2 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-bounce" />
              </div>
            </div>
            
            <div className="flex gap-2 w-full mt-6">
              <label className="flex-1 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 py-2.5 text-xs font-semibold text-slate-300 shadow-sm transition-all text-center cursor-pointer flex items-center justify-center gap-1.5">
                <UploadCloud className="h-4 w-4 text-slate-400" />
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
                className="flex-1 rounded-xl bg-slate-800 hover:bg-slate-700 py-2.5 text-xs font-semibold text-white shadow-sm transition-all"
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