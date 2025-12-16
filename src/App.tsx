import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, CheckCircle, Clock, User, Phone, FileText, PlusCircle, 
  Lock, Unlock, LogOut, Instagram, Heart, Smile, X, Edit2, Save, Trash2, 
  Wifi, WifiOff, RefreshCw, ChevronRight, ChevronLeft, ChevronDown, AlertCircle, Trash, Settings, List, AlertTriangle, Info, Copy, MessageSquare, DollarSign, StickyNote, MapPin, Share2, Tag, Star, Eye, RotateCcw, Download,
  Check, HelpCircle, Mail, Camera, Sparkles, Pencil, Undo2, CalendarDays, Send, Bell, Plus, GripVertical, XCircle, MoreVertical, Ban, History
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp, setDoc, getDoc, query, orderBy, writeBatch } from 'firebase/firestore';

// --- Firebase Config ---
// 請確認這些設定與你的 Firebase Console 一致
const firebaseConfig = {
  apiKey: "AIzaSyCg9qkjy-snxi4OM4cPx4DV30N1ih8Jegg",
  authDomain: "winii-reservation-system.firebaseapp.com",
  projectId: "winii-reservation-system",
  storageBucket: "winii-reservation-system.firebasestorage.app",
  messagingSenderId: "612418509774",
  appId: "1:612418509774:web:86789dabce1e57e439e99f",
  measurementId: "G-VS6Y3BZYMP"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 修正重點 1: 直接指定你的 App ID，不再依賴環境變數
const appId = 'winii-official-production';

// --- Theme Colors ---
// Hair Orange: #FA8C76
// Planet Teal: #65D3BB
// Dark Text: #5D5550
// Background: #FFFBF9

// --- Types ---
type Status = 'pending_payment' | 'booked' | 'completed'; 

interface Slot {
  id: string;
  date: string; 
  time: string; 
  isFull: boolean;
  isWaitlist?: boolean; 
}

interface Appointment {
  id: string;
  // Section 1: Customer Info
  ownerName: string;      
  petRelation: string;    
  instagramId: string;    
  customerType: string;   
  
  // Section 2: Pet Info
  petSpecies: string;     
  petSpeciesOther?: string;
  petAge: string;         
  
  // Section 3: Service Info
  plan: string;           
  reiki: string;          
  questions: string;      
  
  // Section 4: Misc
  shareConsent: string;   
  source: string;         
  sourceOther?: string;
  
  // System
  agreedToTerms: boolean; 
  finalConfirmed: boolean; 
  
  adminNotes?: string;
  customPrice?: number;
  selectedSlots: Slot[];
  date: string; 
  time: string; 
  status: Status;
  isReminded?: boolean; // New field for Reminder status
  createdAt: any;
  deletedAt?: any;
}

// --- Helper Functions ---
const getSafeDate = (dateStr: string) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
};

const formatSlotDisplay = (date: string, time: string) => {
  const d = new Date(date);
  if (isNaN(d.getTime())) return `${date} ${time}`;
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekDay = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return `${month}/${day} (${weekDay}) ${time}`;
};

const formatShortDate = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getMonth() + 1}/${d.getDate()}`;
};

const formatDateWithWeek = (dateStr: string) => {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekDay = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return `${month}/${day} (${weekDay})`;
};

const getWeekDayOnly = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const weekDay = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return `(${weekDay})`;
}

// Fixed formatForMessage to be more robust
const formatForMessage = (dateStr: string, timeStr: string) => {
  if (!dateStr) return timeStr || '';
  try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return `${dateStr} ${timeStr || ''}`;
      const month = d.getMonth() + 1;
      const day = d.getDate();
      const weekDay = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
      return `${month}／${day}（${weekDay}）${timeStr || ''}`;
  } catch (e) {
      return `${dateStr} ${timeStr || ''}`;
  }
};

const extractPrice = (app: Appointment) => {
  if (app.customPrice !== undefined && app.customPrice !== null) {
    return app.customPrice;
  }
  const plan = app.plan || '';
  const match = plan.match(/\$(\d+)/);
  return match ? parseInt(match[1]) : 0;
};

const extractDuration = (planStr: string) => {
    const match = (planStr || '').match(/(\d+)min/);
    return match ? match[1] : '';
};

const getReikiDisplay = (option: string) => {
    if (!option) return '';
    if (option.includes('毛孩體驗')) return '毛孩體驗靈氣';
    if (option.includes('不需要') || option.includes('不須')) return '不須靈氣體驗';
    return option;
};

// --- Defaults ---
const DEFAULT_SPECIES = ['貓', '狗', '鼠', '兔', '鳥'];
const DEFAULT_PLANS = [
  '在世溝通 30min/$550',
  '在世溝通 60min/$1000 (一隻毛孩)',
  '在世溝通 60min/$1050 (兩隻毛孩)',
  '離世溝通 30min/$650',
  '離世溝通 60min/$1200'
];
const DEFAULT_SOURCES = ['IG 自己搜尋到', 'IG 廣告看到', 'FB', 'Threads', '親友推薦'];
const DEFAULT_REIKI = [
  '好! 我想讓毛孩體驗',
  '不需要，謝謝!'
];
const DEFAULT_SHARING = ['可以的', '不太方便'];

// Default Form Labels (Prompts)
const DEFAULT_PROMPTS = {
    ownerName: "請問如何稱呼您?",
    petRelation: "您是毛孩的誰? (媽媽/姊姊...等)",
    instagramId: "您的Insgram ID (或FB名稱)",
    customerType: "您是寵物星球的 新朋友 or 老朋友 呢?",
    petSpecies: "寶貝的物種/品種",
    petAge: "寶貝年齡 (數字)",
    petStatus: "目前狀態",
    petDeceasedTime: "已離世多久?",
    plan: "想要預約的方案",
    time: "想要預約的時間",
    reiki: "是否想要體驗靈氣療癒呢?",
    sharing: "若整體溝通順利，是否願意讓溫妮擷取部分溝通內容至社群分享呢?",
    source: "請問是從哪裡知道溫妮的呢?"
};

const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'));

// --- Components ---

const Toast = ({ message, type, onClose }: { message: string, type: 'success' | 'error' | 'info', onClose: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColors = {
    success: 'bg-[#65D3BB]',
    error: 'bg-[#FA8C76]',
    info: 'bg-gray-700'
  };

  return (
    <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-[100] px-6 py-3 rounded-full text-white shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-4 ${bgColors[type]}`}>
      {type === 'success' && <CheckCircle className="w-5 h-5" />}
      {type === 'error' && <AlertCircle className="w-5 h-5" />}
      {type === 'info' && <Info className="w-5 h-5" />}
      <span className="font-bold tracking-wide">{message}</span>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [view, setView] = useState<'form' | 'admin' | 'login'>('form'); 
  const [adminTab, setAdminTab] = useState<'list' | 'calendar' | 'slots' | 'settings' | 'trash'>('list'); 
  const [listFilter, setListFilter] = useState<Status>('pending_payment');
  
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [deletedAppointments, setDeletedAppointments] = useState<Appointment[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotNote, setSlotNote] = useState(''); 
  const [collapsedMonths, setCollapsedMonths] = useState<string[]>([]); 
  
  // Dynamic Options & Prompts
  const [speciesOpts, setSpeciesOpts] = useState<string[]>(DEFAULT_SPECIES);
  const [planOpts, setPlanOpts] = useState<string[]>(DEFAULT_PLANS);
  const [sourceOpts, setSourceOpts] = useState<string[]>(DEFAULT_SOURCES);
  const [reikiOpts, setReikiOpts] = useState<string[]>(DEFAULT_REIKI);
  const [sharingOpts, setSharingOpts] = useState<string[]>(DEFAULT_SHARING);
  const [formPrompts, setFormPrompts] = useState(DEFAULT_PROMPTS);

  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);

  // UI State
  const [reikiModalOpen, setReikiModalOpen] = useState(false);
  const [msgModalOpen, setMsgModalOpen] = useState(false);
  const [msgContent, setMsgContent] = useState('');
  
  // Delete State
  const [deleteTarget, setDeleteTarget] = useState<{ id: string, type: 'app' | 'slot' } | null>(null);
  const [deleteConfirmModalOpen, setDeleteConfirmModalOpen] = useState(false);

  const [toast, setToast] = useState<{msg: string, type: 'success' | 'error' | 'info'} | null>(null);
  const [viewAppModal, setViewAppModal] = useState<Appointment | null>(null);
  
  // Calendar View State
  const [calDate, setCalDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date()); 

  // Admin Editing State
  const [dateEditModalOpen, setDateEditModalOpen] = useState(false);
  const [editingAppId, setEditingAppId] = useState<string | null>(null);
  const [tempDate, setTempDate] = useState('');
  // Time Picker State for Editing
  const [tempHour, setTempHour] = useState('13');
  const [tempMinute, setTempMinute] = useState('00');
  
  const [noteEditModalOpen, setNoteEditModalOpen] = useState(false);
  const [tempNoteContent, setTempNoteContent] = useState('');

  const [priceEditModalOpen, setPriceEditModalOpen] = useState(false);
  const [tempPrice, setTempPrice] = useState('');

  // Settings Edit State
  const [newOptionInput, setNewOptionInput] = useState('');
  const [activeSettingSection, setActiveSettingSection] = useState<string | null>(null);

  // Admin Auth
  const [pin, setPin] = useState('');
  const ADMIN_PIN = "8888";

  // Form State
  const initialFormState = {
    ownerName: '', petRelation: '', instagramId: '', customerType: '',
    petSpecies: '', petSpeciesOther: '', petAge: '',
    plan: '', reiki: '', questions: '', shareConsent: '',
    source: '', sourceOther: '',
    agreedToTerms: false,
    finalConfirmed: false
  };
  const [formData, setFormData] = useState(initialFormState);
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([]); 

  // --- Pet Age Logic State ---
  const [petAgeNum, setPetAgeNum] = useState('');
  const [petIsDeceased, setPetIsDeceased] = useState<boolean | null>(null);
  const [petDeceasedTime, setPetDeceasedTime] = useState('');

  useEffect(() => {
    let finalAge = petAgeNum ? `${petAgeNum}歲` : '';
    if (finalAge && petIsDeceased) {
        if (petDeceasedTime) {
            finalAge += ` 已離世 ${petDeceasedTime}`;
        } else {
            finalAge += ` 已離世`;
        }
    }
    setFormData(prev => ({ ...prev, petAge: finalAge }));
  }, [petAgeNum, petIsDeceased, petDeceasedTime]);

  // Handle passed away logic for reiki
  useEffect(() => {
      if (formData.plan.includes('離世')) {
          setFormData(prev => ({ ...prev, reiki: '不須靈氣體驗' }));
      }
  }, [formData.plan]);

  // Admin Slot Management State
  const [newSlotDate, setNewSlotDate] = useState('');
  const [newSlotHour, setNewSlotHour] = useState('13');
  const [newSlotMinute, setNewSlotMinute] = useState('00');

  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ msg, type });
  };

  // --- Authentication (修正重點 2: 移除客製化 Token 檢查，使用匿名登入) ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (e) {
        console.error("Auth failed", e);
        try { await signInAnonymously(auth); } catch (e2) { setAuthError(true); }
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, u => {
      setUser(u);
      if(u) setAuthError(false);
    });
    return () => unsubscribe();
  }, []);

  // --- Data Fetching ---
  useEffect(() => {
    if (!user) return;

    // Active Appointments
    const qApps = collection(db, 'artifacts', appId, 'public', 'data', 'winii_appointments');
    const unsubApps = onSnapshot(qApps, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Appointment[];
      docs.sort((a, b) => {
        const da = getSafeDate(a.date)?.getTime() ?? 9999999999999;
        const db = getSafeDate(b.date)?.getTime() ?? 9999999999999;
        if (da === db) {
            const ta = a.time || '00:00';
            const tb = b.time || '00:00';
            return ta.localeCompare(tb);
        }
        return da - db;
      });
      setAppointments(docs);
      setLoading(false);
    }, (err) => console.error("App fetch error:", err));

    // Deleted Appointments (Trash)
    const qDeleted = collection(db, 'artifacts', appId, 'public', 'data', 'winii_deleted_appointments');
    const unsubDeleted = onSnapshot(qDeleted, snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Appointment[];
        docs.sort((a, b) => (b.deletedAt?.seconds || 0) - (a.deletedAt?.seconds || 0)); 
        setDeletedAppointments(docs);
    });

    // Slots
    const qSlots = collection(db, 'artifacts', appId, 'public', 'data', 'winii_slots');
    const unsubSlots = onSnapshot(qSlots, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Slot[];
      docs.sort((a, b) => {
        return new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime();
      });
      setSlots(docs);
    }, (err) => console.error("Slot fetch error:", err));

    // Fetch Settings
    const fetchConfig = async () => {
        try {
            const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'winii_settings', 'global');
            onSnapshot(docRef, (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setSlotNote(data.note || '');
                    if(data.species) setSpeciesOpts(data.species);
                    if(data.plans) setPlanOpts(data.plans);
                    if(data.sources) setSourceOpts(data.sources);
                    if(data.reiki) setReikiOpts(data.reiki);
                    if(data.sharing) setSharingOpts(data.sharing);
                    if(data.formPrompts) setFormPrompts({ ...DEFAULT_PROMPTS, ...data.formPrompts });
                }
            });
        } catch(e) {}
    };
    fetchConfig();

    return () => { unsubApps(); unsubSlots(); unsubDeleted(); };
  }, [user]);

  // --- CSV Export Logic ---
  const downloadCSV = () => {
    const headers = [
        "預約日期", "預約時間", "狀態", 
        "家長姓名", "稱呼", "IG帳號", "新舊客",
        "種類", "年齡", 
        "方案", "問題", "金額", "靈氣", 
        "分享意願", "來源", "備註", "ID"
    ];

    const csvRows = [headers.join(',')];
    const dataToExport = adminTab === 'trash' ? deletedAppointments : appointments;

    dataToExport.forEach(app => {
      const escape = (text: string | undefined | null) => {
          if (!text) return '""';
          return `"${text.toString().replace(/"/g, '""')}"`;
      };

      const row = [
        escape(app.date),
        escape(app.time),
        escape(app.status === 'booked' ? '已預約' : app.status === 'completed' ? '已完成' : '待匯款'),
        escape(app.ownerName),
        escape(app.petRelation),
        escape(app.instagramId),
        escape(app.customerType),
        escape(app.petSpecies),
        escape(app.petAge),
        escape(app.plan),
        escape(app.questions),
        extractPrice(app),
        escape(app.reiki),
        escape(app.shareConsent),
        escape(app.source === '其他' ? app.sourceOther : app.source),
        escape(app.adminNotes || ''),
        escape(app.id)
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = "\uFEFF" + csvRows.join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const dateStr = new Date().toISOString().slice(0,10);
    link.download = `Winii_Apps_${adminTab}_${dateStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Logic Helpers ---
  const calendarGrid = useMemo(() => {
    const year = calDate.getFullYear();
    const month = calDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    for(let i = 0; i < firstDay; i++) days.push(null);
    for(let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
    return days;
  }, [calDate]);

  const getDayAppointments = (date: Date) => {
    if (!date) return [];
    return appointments.filter(app => {
      // Allow all active appointments to show in calendar regardless of status (unless filtered out by logic)
      if ((app.status as any) === 'addon') return false; // Filter out addons if any
      const appDate = getSafeDate(app.date);
      return appDate && 
             appDate.getDate() === date.getDate() && 
             appDate.getMonth() === date.getMonth() && 
             appDate.getFullYear() === date.getFullYear();
    });
  };

  const nextMonth = () => setCalDate(new Date(calDate.getFullYear(), calDate.getMonth() + 1, 1));
  const prevMonth = () => setCalDate(new Date(calDate.getFullYear(), calDate.getMonth() - 1, 1));

  // --- Admin Functions ---
  const addSlot = async () => {
    if (!newSlotDate) return showToast("請選擇日期", 'error');
    const timeString = `${newSlotHour}:${newSlotMinute}`;
    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'winii_slots'), {
            date: newSlotDate,
            time: timeString,
            isFull: false,
            isWaitlist: false
        });
        showToast("時段新增成功", 'success');
    } catch(e) { showToast("新增失敗", 'error'); }
  };

  const toggleSlotFull = async (slot: Slot) => {
      const newIsFull = !slot.isFull;
      const updateData: any = { isFull: newIsFull };
      if (newIsFull) {
          updateData.isWaitlist = false; // Auto turn off waitlist if full
      }
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'winii_slots', slot.id), updateData);
  };
  const toggleSlotWaitlist = async (slot: Slot) => {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'winii_slots', slot.id), { isWaitlist: !slot.isWaitlist });
  };
  
  // Replaced direct delete with modal initiation
  const initiateSlotDelete = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setDeleteTarget({ id, type: 'slot' });
      setDeleteConfirmModalOpen(true);
  };

  const saveSlotNote = async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'winii_settings', 'global'), { note: slotNote }, { merge: true });
        showToast("說明文字儲存成功", 'success');
      } catch(e) { showToast("儲存失敗", 'error'); }
  };

  // --- Settings Management ---
  const saveSettings = async (field: string, newValue: any) => {
      try {
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'winii_settings', 'global'), { [field]: newValue }, { merge: true });
      } catch(e) { showToast("更新失敗", 'error'); }
  };

  // Helper for adding an option to a specific list
  const addOptionToType = (type: 'species' | 'plans' | 'sources' | 'reiki' | 'sharing', value: string) => {
      if(!value.trim()) return;
      let newOptions: string[] = [];
      if(type === 'species') newOptions = [...speciesOpts, value];
      if(type === 'plans') newOptions = [...planOpts, value];
      if(type === 'sources') newOptions = [...sourceOpts, value];
      if(type === 'reiki') newOptions = [...reikiOpts, value];
      if(type === 'sharing') newOptions = [...sharingOpts, value];
      
      saveSettings(type, newOptions);
  };

  // Helper for removing an option by Index
  const removeOptionByIndex = (type: 'species' | 'plans' | 'sources' | 'reiki' | 'sharing', index: number) => {
      let newOptions: string[] = [];
      if(type === 'species') newOptions = speciesOpts.filter((_, i) => i !== index);
      if(type === 'plans') newOptions = planOpts.filter((_, i) => i !== index);
      if(type === 'sources') newOptions = sourceOpts.filter((_, i) => i !== index);
      if(type === 'reiki') newOptions = reikiOpts.filter((_, i) => i !== index);
      if(type === 'sharing') newOptions = sharingOpts.filter((_, i) => i !== index);
      
      saveSettings(type, newOptions);
  };

  // Helper to update local state for options
  const handleOptionChange = (type: 'species' | 'plans' | 'sources' | 'reiki' | 'sharing', index: number, value: string) => {
      if (type === 'species') {
          const newOpts = [...speciesOpts]; newOpts[index] = value; setSpeciesOpts(newOpts);
      } else if (type === 'plans') {
          const newOpts = [...planOpts]; newOpts[index] = value; setPlanOpts(newOpts);
      } else if (type === 'sources') {
          const newOpts = [...sourceOpts]; newOpts[index] = value; setSourceOpts(newOpts);
      } else if (type === 'reiki') {
          const newOpts = [...reikiOpts]; newOpts[index] = value; setReikiOpts(newOpts);
      } else if (type === 'sharing') {
          const newOpts = [...sharingOpts]; newOpts[index] = value; setSharingOpts(newOpts);
      }
  };

  // Helper to save options to DB on blur
  const handleOptionBlur = (type: 'species' | 'plans' | 'sources' | 'reiki' | 'sharing') => {
      let optionsToSave: string[] = [];
      if (type === 'species') optionsToSave = speciesOpts;
      else if (type === 'plans') optionsToSave = planOpts;
      else if (type === 'sources') optionsToSave = sourceOpts;
      else if (type === 'reiki') optionsToSave = reikiOpts;
      else if (type === 'sharing') optionsToSave = sharingOpts;
      
      saveSettings(type, optionsToSave);
  };

  const handlePromptChange = (key: keyof typeof DEFAULT_PROMPTS, value: string) => {
      const newPrompts = { ...formPrompts, [key]: value };
      setFormPrompts(newPrompts);
  };

  const savePrompts = () => {
      saveSettings('formPrompts', formPrompts);
      showToast("文案已儲存", 'success');
  };

  // --- Editing ---
  const openDateEditModal = (app: Appointment) => {
      setEditingAppId(app.id);
      setTempDate(app.date || '');
      // Parse time into HH and MM for select dropdowns
      const [h, m] = (app.time || '13:00').split(':');
      setTempHour(h || '13');
      setTempMinute(m || '00');
      setDateEditModalOpen(true);
  };
  const saveFinalDate = async () => {
    if(!editingAppId) return;
    const finalTime = `${tempHour}:${tempMinute}`;
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'winii_appointments', editingAppId), { date: tempDate, time: finalTime });
      setDateEditModalOpen(false);
      setEditingAppId(null);
      showToast("時間更新成功", 'success');
    } catch(e) { showToast("更新失敗", 'error'); }
  };
  const openNoteEditModal = (app: Appointment) => {
      setEditingAppId(app.id);
      setTempNoteContent(app.adminNotes || '');
      setNoteEditModalOpen(true);
  };
  const saveAdminNote = async () => {
    if(!editingAppId) return;
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'winii_appointments', editingAppId), { adminNotes: tempNoteContent });
      setNoteEditModalOpen(false);
      setEditingAppId(null);
      showToast("備註更新成功", 'success');
    } catch(e) { showToast("備註儲存失敗", 'error'); }
  };

  const openPriceEditModal = (app: Appointment) => {
    setEditingAppId(app.id);
    setTempPrice(extractPrice(app).toString());
    setPriceEditModalOpen(true);
  };
  const savePrice = async () => {
    if(!editingAppId) return;
    try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'winii_appointments', editingAppId), { customPrice: parseInt(tempPrice) });
        setPriceEditModalOpen(false);
        setEditingAppId(null);
        showToast("金額更新成功", 'success');
    } catch(e) { showToast("金額更新失敗", 'error'); }
  };
  
  const calculateMonthTotal = (monthApps: Appointment[]) => {
    return monthApps.reduce((sum, app) => {
      if (app.status === 'completed') return sum + extractPrice(app);
      return sum;
    }, 0);
  };

  const counts = useMemo(() => {
    return {
        pending: appointments.filter(a => (a.status as any) === 'pending' || a.status === 'pending_payment').length,
        booked: appointments.filter(a => a.status === 'booked').length,
        completed: appointments.filter(a => (a.status as any) === 'addon' || a.status === 'completed').length
    };
  }, [appointments]);

  // Toggle month collapse
  const toggleMonthCollapse = (month: string) => {
      setCollapsedMonths(prev => 
          prev.includes(month) ? prev.filter(m => m !== month) : [...prev, month]
      );
  };

  const openPaymentModal = (app: Appointment) => {
    try {
      if (!app) {
        console.error("No appointment data");
        return;
      }
      
      console.log("Generating payment info for:", app);

      // Safe Data Extraction
      const dateStr = app.date ? String(app.date) : '';
      const timeStr = app.time ? String(app.time) : '';
      const planName = app.plan ? String(app.plan) : '未選擇方案';
      
      let formattedDate = `${dateStr} ${timeStr}`;
      try {
         if(dateStr) {
             const d = new Date(dateStr);
             if (!isNaN(d.getTime())) {
                 const month = d.getMonth() + 1;
                 const day = d.getDate();
                 const weekDay = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
                 formattedDate = `${month}／${day}（${weekDay}）${timeStr}`;
             }
         }
      } catch(e) {
          console.error("Date formatting error", e);
      }

      const price = extractPrice(app);

      const template = `您填寫的預約資訊已確認完成如下🥰
❙ 預約時間：${formattedDate}
❙ 預約方案：${planName}

❙ 費用：${price}元

如上述預約資訊無誤，請於24小時內匯款完成，以保留預約資格❣️
🌿中國信託 (822)
613540525186
🌿國泰世華 (013)
699514757716
🌿台新銀行 (812)
28881004798230

*匯款完成後，請通知已匯款，將會邀請您加入LINE帳號
*若無在時間內完成，視為取消預約並不另行通知`;

      setMsgContent(template);
      setMsgModalOpen(true);
    } catch (error) {
      console.error("Critical error in openPaymentModal:", error);
      showToast("系統錯誤，無法開啟視窗", "error");
    }
  };

  const copyToClipboard = (text: string) => {
    // Force use of execCommand for better compatibility in iframes
    const textArea = document.createElement("textarea");
    textArea.value = text;
    
    // Ensure textarea is not visible but part of DOM
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showToast("已複製！", 'success');
            if(msgModalOpen) setMsgModalOpen(false);
        } else {
            showToast("複製失敗，請手動複製", 'error');
        }
    } catch (err) {
        console.error('Fallback: Oops, unable to copy', err);
        showToast("複製失敗，請手動複製", 'error');
    }
    
    document.body.removeChild(textArea);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const toggleSlotSelection = (slotId: string) => {
      setSelectedSlotIds(prev => {
          if (prev.includes(slotId)) return prev.filter(id => id !== slotId);
          return [...prev, slotId];
      });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return showToast("系統連線中，請稍候...", 'info');
    if (!formData.agreedToTerms) return showToast("請勾選「已了解並同意...」", 'error');
    if (!formData.finalConfirmed) return showToast("請勾選「會記得追蹤...」", 'error');
    if (!formData.customerType) return showToast("請選擇新/老朋友", 'error');
    if (!formData.petAge) return showToast("請填寫寶貝的年齡", 'error');
    
    const chosenSlots = slots.filter(s => selectedSlotIds.includes(s.id));
    if (chosenSlots.length === 0) return showToast("請至少勾選一個有效的預約時段！", 'error');

    setSubmitting(true);
    try {
      const sortedSlots = [...chosenSlots].sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime());

      const payload = {
        ...formData,
        petSpecies: formData.petSpecies === '其他' ? formData.petSpeciesOther : formData.petSpecies,
        source: formData.source === '其他' ? formData.sourceOther : formData.source,
        selectedSlots: sortedSlots,
        date: sortedSlots[0].date, 
        time: sortedSlots[0].time, 
        status: 'pending_payment' as Status,
        createdAt: serverTimestamp()
      };
      
      delete (payload as any).finalConfirmed;
      delete (payload as any).agreedToTerms;
      delete (payload as any).petSpeciesOther;
      delete (payload as any).sourceOther;

      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'winii_appointments'), payload);

      // --- Auto Waitlist Feature ---
      // Automatically mark selected slots as waitlist to prevent double booking
      for (const slot of chosenSlots) {
          // Only mark as waitlist if it's not already full (to be safe, though users shouldn't be able to select full)
          if (!slot.isFull) {
              await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'winii_slots', slot.id), {
                  isWaitlist: true
              });
          }
      }

      setSubmitSuccess(true);
      window.scrollTo(0, 0);
    } catch (e) {
      console.error(e);
      showToast("提交失敗，請檢查網路或稍後再試", 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (id: string, newStatus: Status) => {
    // When marking as booked, remove reminded status
    const updateData: any = { status: newStatus };
    if (newStatus === 'booked') {
        updateData.isReminded = false;
    }
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'winii_appointments', id), updateData);
    
    // Auto-mark slot as full if status is booked
    if (newStatus === 'booked') {
        const app = appointments.find(a => a.id === id);
        if (app) {
            const slot = slots.find(s => s.date === app.date && s.time === app.time);
            if (slot) {
                // Also turn off waitlist if marking full
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'winii_slots', slot.id), { isFull: true, isWaitlist: false });
            }
        }
    }

    showToast(`狀態已更新`, 'success');
  };

  const markAsReminded = async (app: Appointment) => {
      // 1. Update Appointment
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'winii_appointments', app.id), { isReminded: true });
      
      // 2. Update Specific Slot to Waitlist
      const targetSlotId = slots.find(s => s.date === app.date && s.time === app.time)?.id;
      if (targetSlotId) {
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'winii_slots', targetSlotId), { isWaitlist: true });
      }
      
      showToast("已標記提醒並將時段設為候補", 'success');
  };

  const initiateDelete = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setDeleteTarget({ id, type: 'app' });
      setDeleteConfirmModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    
    try {
      if (deleteTarget.type === 'app') {
          const appToDeleteData = appointments.find(a => a.id === deleteTarget.id);
          if (appToDeleteData) {
              const deletedData = { ...appToDeleteData, deletedAt: serverTimestamp() };
              delete (deletedData as any).id;
              await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'winii_deleted_appointments'), deletedData);
          }
          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'winii_appointments', deleteTarget.id));
          showToast("已移至垃圾桶", 'success');
      } else if (deleteTarget.type === 'slot') {
          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'winii_slots', deleteTarget.id));
          showToast("時段已刪除", 'success');
      }
    } catch(e) { showToast("刪除失敗", 'error'); }
    
    setDeleteConfirmModalOpen(false);
    setDeleteTarget(null);
  };
  
  // New function: Restore deleted appointment
  const restoreDeletedApp = async (app: Appointment) => {
    try {
        const { id, deletedAt, ...appData } = app;
        // Add back to active appointments with pending status
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'winii_appointments'), {
            ...appData,
            status: 'pending_payment',
            createdAt: serverTimestamp() // Reset timestamp or keep original? Keeping logic simple for now
        });
        // Remove from deleted
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'winii_deleted_appointments', id));
        showToast("已還原至待匯款", 'success');
    } catch (e) {
        showToast("還原失敗", 'error');
    }
  };

  // Permanently delete specific deleted appointment
  const permanentlyDeleteApp = async (id: string) => {
      if(!confirm("確定要永久刪除此資料嗎？此動作無法復原。")) return;
      try {
          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'winii_deleted_appointments', id));
          showToast("已永久刪除", 'success');
      } catch(e) { showToast("刪除失敗", 'error'); }
  };

  // Clear all deleted appointments
  const clearAllTrash = async () => {
      if(!confirm("確定要清空所有垃圾桶資料嗎？此動作無法復原。")) return;
      try {
          // Note: This iterates through all locally loaded deleted appointments. 
          // For very large datasets, a cloud function is better, but this works for client-side lists.
          const promises = deletedAppointments.map(app => 
              deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'winii_deleted_appointments', app.id))
          );
          await Promise.all(promises);
          showToast("垃圾桶已清空", 'success');
      } catch(e) { showToast("清空失敗", 'error'); }
  };

  const filteredApps = useMemo(() => {
    const groups: Record<string, Appointment[]> = {};
    const targetApps = appointments.filter(a => {
        let s = a.status;
        if (s as any === 'pending') s = 'pending_payment';
        if (s as any === 'addon') s = 'completed'; 
        return s === listFilter;
    });

    targetApps.forEach(a => {
      let key = '未定日期';
      if (a.date) {
        const d = getSafeDate(a.date);
        if (d) key = `${d.getFullYear()}年 ${d.getMonth() + 1}月`;
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    });
    return groups;
  }, [appointments, listFilter]);

  // FIX: 使用 fixed top-0 left-0 w-full h-full 強制覆蓋視窗，解決預覽環境偏左問題
  if (loading && !authError) return <div className="fixed top-0 left-0 w-full h-full z-50 flex items-center justify-center bg-[#FFFBF9] text-[#FA8C76]"><RefreshCw className="animate-spin mr-2"/> 載入中...</div>;

  // Configuration for the "Google Forms" style editor
  const formSections = [
      { id: 'ownerName', type: 'text', label: '家長姓名題' },
      { id: 'petRelation', type: 'text', label: '稱呼題' },
      { id: 'instagramId', type: 'text', label: 'IG帳號題' },
      { id: 'customerType', type: 'text', label: '新舊客題' },
      { id: 'petSpecies', type: 'options', label: '物種題', optionKey: 'species' as const, options: speciesOpts },
      { id: 'petAge', type: 'text', label: '年齡題' },
      { id: 'petStatus', type: 'text', label: '狀態題' },
      { id: 'petDeceasedTime', type: 'text', label: '離世時間題' },
      { id: 'plan', type: 'options', label: '方案題', optionKey: 'plans' as const, options: planOpts },
      { id: 'time', type: 'text', label: '時間題' },
      { id: 'reiki', type: 'options', label: '靈氣題', optionKey: 'reiki' as const, options: reikiOpts },
      { id: 'sharing', type: 'options', label: '分享意願題', optionKey: 'sharing' as const, options: sharingOpts },
      { id: 'source', type: 'options', label: '來源題', optionKey: 'sources' as const, options: sourceOpts },
  ];

  // Helper Component for Bottom Nav
  const NavButton = ({ active, icon: Icon, label, onClick }: { active: boolean, icon: any, label: string, onClick: () => void }) => (
    <button 
        onClick={onClick} 
        className={`flex flex-col items-center justify-center gap-1 transition-all duration-200 ${active ? 'text-[#FA8C76] scale-105 font-bold' : 'text-[#A8A09B] hover:text-[#5D5550]'}`}
    >
        <div className={`p-1 rounded-xl transition-colors ${active ? 'bg-[#FFF0EC]' : 'bg-transparent'}`}>
            <Icon size={24} strokeWidth={active ? 2.5 : 2} />
        </div>
        <span className="text-[10px] tracking-wide">{label}</span>
    </button>
  );

  return (
    <>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      
      {view === 'form' && (
        <div className="w-full min-h-screen bg-[#FFFBF9] font-sans text-[#5D5550] pb-12">
            {submitSuccess ? (
                // FIX: 使用 fixed top-0 left-0 w-full h-full 強制覆蓋視窗，確保絕對置中
                <div className="fixed top-0 left-0 w-full h-full z-50 bg-[#FFFBF9] flex flex-col items-center justify-center px-6 text-center animate-in fade-in zoom-in duration-500 overflow-y-auto">
                    <div className="w-full max-w-md mx-auto flex flex-col items-center">
                        <div className="w-24 h-24 bg-[#65D3BB]/20 rounded-full flex items-center justify-center mb-6 text-[#2D7A6E]">
                            <CheckCircle className="w-12 h-12" />
                        </div>
                        <h2 className="text-3xl font-bold text-[#5D5550] mb-8">表單已送出</h2>
                        
                        <div className="bg-red-50 border-2 border-red-200 p-8 rounded-2xl shadow-lg text-center space-y-4 mb-8 w-full relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-2 bg-red-400"></div>
                            <h3 className="font-bold text-red-500 text-xl flex items-center justify-center gap-2">
                                預約只差一步了🧡
                            </h3>
                            <p className="text-[#5D5550] font-bold text-lg">
                            請務必 <span className="text-red-500 underline decoration-2 underline-offset-4">私訊溫妮</span> 確認
                            </p>
                            <p className="text-[#8D8580] text-sm leading-relaxed">
                            若無私訊確認或資料不完整<br/>將視為無效預約
                            </p>
                            <div className="pt-2">
                                <button onClick={() => window.open('https://www.instagram.com/winii_petplanet/?igsh=MTFwcjU5Z3diY3VhdQ%3D%3D&utm_source=qr#', '_blank')} className="bg-white border border-red-200 text-red-500 px-4 py-2 rounded-full text-sm font-bold shadow-sm hover:bg-red-50 transition">
                                    前往 Instagram 私訊
                                </button>
                            </div>
                        </div>

                        <button onClick={() => window.location.reload()} className="bg-[#FA8C76] text-white px-8 py-3 rounded-full font-bold shadow-lg hover:bg-[#E8755F] transition transform hover:scale-105">
                            回到表單
                        </button>
                    </div>
                </div>
            ) : (
                <div className="max-w-lg mx-auto bg-white min-h-screen shadow-2xl relative animate-in fade-in slide-in-from-bottom-4 rounded-t-[3rem] overflow-hidden mt-4 border-t-8 border-[#FA8C76]">
                    
                    {/* Header with Logo */}
                    <div className="relative pt-12 pb-6 px-6 bg-[#FFFBF9] flex flex-col items-center justify-center text-center">
                        <div className="w-48 h-48 bg-white rounded-full p-2 shadow-lg mb-4 flex items-center justify-center overflow-hidden border-4 border-[#FA8C76]/20">
                             {/* Logo */}
                             <img src="logo.jpg" alt="Winii Logo" className="w-full h-full object-cover rounded-full" onError={(e) => {
                                 (e.target as HTMLImageElement).style.display = 'none';
                                 (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                             }}/>
                             <div className="hidden flex flex-col items-center text-[#FA8C76] opacity-50">
                                 <Heart className="w-12 h-12 mb-2 fill-current"/>
                                 <span className="text-xs font-bold">Winii</span>
                             </div>
                        </div>
                        <h1 className="text-2xl font-bold mb-3 tracking-wider text-[#5D5550]">Winii's pet planet<br/>寵物溝通預約表</h1>
                        <div className="h-1 w-12 bg-[#65D3BB] rounded-full mb-4"></div>
                        <p className="text-[#8D8580] text-xs tracking-wide leading-relaxed max-w-xs mx-auto mb-2">
                            我是寵物溝通師 溫妮<br/>
                            感謝您選擇與我一同前往探索毛孩內心世界✨
                        </p>
                        <p className="text-[#FA8C76] text-xs font-bold">
                            為維護彼此權益，請先確認充分了解以下內容再填寫，謝謝❤️
                        </p>

                        <button 
                            onClick={() => setView('login')} 
                            className="absolute top-4 right-4 text-[#FA8C76] hover:text-[#E8755F] transition p-2 font-bold text-sm bg-white/50 rounded-full"
                        >
                            後台管理
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-8 bg-white rounded-t-[2.5rem] shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]">
                        
                        {/* 2. Owner Info */}
                        <section className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-[#5D5550] mb-1.5">{formPrompts.ownerName} <span className="text-red-400">*</span></label>
                                <input type="text" name="ownerName" required value={formData.ownerName} onChange={handleInputChange} placeholder="簡答文字" className="w-full bg-[#FBF9F8] border-b border-[#E3DCD8] px-2 py-3 focus:bg-white focus:border-[#FA8C76] outline-none transition text-[#5D5550] placeholder:text-[#D1CCC8]"/>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-[#5D5550] mb-1.5">{formPrompts.petRelation} <span className="text-red-400">*</span></label>
                                <input type="text" name="petRelation" required value={formData.petRelation} onChange={handleInputChange} placeholder="簡答文字" className="w-full bg-[#FBF9F8] border-b border-[#E3DCD8] px-2 py-3 focus:bg-white focus:border-[#FA8C76] outline-none transition text-[#5D5550] placeholder:text-[#D1CCC8]"/>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-[#5D5550] mb-1.5">{formPrompts.instagramId} <span className="text-red-400">*</span></label>
                                <input type="text" name="instagramId" required value={formData.instagramId} onChange={handleInputChange} placeholder="簡答文字" className="w-full bg-[#FBF9F8] border-b border-[#E3DCD8] px-2 py-3 focus:bg-white focus:border-[#FA8C76] outline-none transition text-[#5D5550] placeholder:text-[#D1CCC8]"/>
                            </div>

                            {/* Customer Type Moved Here */}
                            <div>
                                <label className="block text-sm font-bold text-[#5D5550] mb-2">
                                    {formPrompts.customerType} <span className="text-red-400">*</span>
                                </label>
                                <div className="text-xs text-[#8D8580] bg-[#FFFBF0] p-2 rounded-lg mb-2 flex items-start gap-1">
                                    <Star className="w-3 h-3 mt-0.5 text-yellow-500 shrink-0"/>
                                    凡2025年8月前溝通過2次(含)以上即為老朋友並享有優惠價(預約確認時會更新價格)
                                </div>
                                <div className="flex gap-4">
                                    {['新朋友', '老朋友'].map(type => (
                                        <label key={type} className={`flex-1 flex items-center justify-center gap-2 cursor-pointer p-4 rounded-2xl border transition-all ${formData.customerType === type ? 'border-[#FA8C76] bg-[#FFF0EC] text-[#FA8C76] font-bold' : 'border-[#F0EAE6] bg-[#FBF9F8] text-[#8D8580]'}`}>
                                            <input type="radio" name="customerType" value={type} checked={formData.customerType === type} onChange={handleInputChange} className="hidden"/>
                                            {type === '新朋友' ? <Sparkles className="w-4 h-4"/> : <Heart className="w-4 h-4"/>}
                                            <span className="text-sm">{type}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </section>

                        <div className="h-px bg-[#F0EAE6] w-full"></div>

                        {/* 3. Pet Info */}
                        <section className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-[#5D5550] mb-2">{formPrompts.petSpecies} <span className="text-red-400">*</span></label>
                                <div className="space-y-2">
                                    {speciesOpts.map(opt => (
                                        <label key={opt} className="flex items-center gap-3 cursor-pointer">
                                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${formData.petSpecies === opt ? 'border-[#FA8C76]' : 'border-gray-300'}`}>
                                                {formData.petSpecies === opt && <div className="w-3 h-3 bg-[#FA8C76] rounded-full"></div>}
                                            </div>
                                            <input type="radio" name="petSpecies" value={opt} checked={formData.petSpecies === opt} onChange={handleInputChange} className="hidden"/>
                                            <span className="text-sm text-[#5D5550]">{opt}</span>
                                        </label>
                                    ))}
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${formData.petSpecies === '其他' ? 'border-[#FA8C76]' : 'border-gray-300'}`}>
                                            {formData.petSpecies === '其他' && <div className="w-3 h-3 bg-[#FA8C76] rounded-full"></div>}
                                        </div>
                                        <input type="radio" name="petSpecies" value="其他" checked={formData.petSpecies === '其他'} onChange={handleInputChange} className="hidden"/>
                                        <span className="text-sm text-[#5D5550]">其他:</span>
                                        {formData.petSpecies === '其他' && (
                                            <input type="text" name="petSpeciesOther" value={formData.petSpeciesOther || ''} onChange={handleInputChange} className="border-b border-[#E3DCD8] outline-none focus:border-[#FA8C76] text-sm text-[#5D5550] px-1 py-0.5 ml-2 w-32"/>
                                        )}
                                    </label>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                <div className="col-span-1 space-y-4">
                                    <div>
                                        <label className="block text-sm font-bold text-[#5D5550] mb-1.5">{formPrompts.petAge} <span className="text-red-400">*</span></label>
                                        <div className="flex items-center gap-2">
                                            <input 
                                                type="text" 
                                                value={petAgeNum} 
                                                onChange={(e) => setPetAgeNum(e.target.value)} 
                                                placeholder="ex: 5" 
                                                className="w-24 bg-[#FBF9F8] border-b border-[#E3DCD8] px-2 py-3 focus:bg-white focus:border-[#FA8C76] outline-none transition text-[#5D5550] placeholder:text-[#D1CCC8]"
                                            />
                                            <span className="text-[#5D5550] font-bold">歲</span>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-[#5D5550] mb-2">{formPrompts.petStatus} <span className="text-red-400">*</span></label>
                                        <div className="flex gap-4">
                                            <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg border border-[#F0EAE6] hover:bg-[#FBF9F8] transition">
                                                <input 
                                                    type="radio" 
                                                    name="petStatus" 
                                                    checked={petIsDeceased === false} 
                                                    onChange={() => setPetIsDeceased(false)}
                                                    className="accent-[#FA8C76]"
                                                />
                                                <span className="text-sm text-[#5D5550]">還在身邊當寶貝</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg border border-[#F0EAE6] hover:bg-[#FBF9F8] transition">
                                                <input 
                                                    type="radio" 
                                                    name="petStatus" 
                                                    checked={petIsDeceased === true} 
                                                    onChange={() => setPetIsDeceased(true)}
                                                    className="accent-[#FA8C76]"
                                                />
                                                <span className="text-sm text-[#5D5550]">已當小天使</span>
                                            </label>
                                        </div>
                                    </div>

                                    {petIsDeceased && (
                                        <div className="animate-in fade-in slide-in-from-top-2">
                                            <label className="block text-sm font-bold text-[#5D5550] mb-1.5">{formPrompts.petDeceasedTime} <span className="text-red-400">*</span></label>
                                            <input 
                                                type="text" 
                                                value={petDeceasedTime} 
                                                onChange={(e) => setPetDeceasedTime(e.target.value)} 
                                                placeholder="ex: 1年" 
                                                className="w-full bg-[#FFF0EC] border-b border-[#FA8C76] px-2 py-3 focus:bg-white outline-none transition text-[#5D5550] placeholder:text-[#D1CCC8]"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>

                        <div className="h-px bg-[#F0EAE6] w-full"></div>

                        {/* 6. Service Selection */}
                        <section className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-[#5D5550] mb-2">{formPrompts.plan} <span className="text-red-400">*</span></label>
                                <div className="text-xs text-[#8D8580] mb-4 space-y-1 leading-relaxed">
                                    <p>30分鐘約3-5題</p>
                                    <p>這部分要看各個家長發問及回覆狀況，30分鐘不一定都能問滿喔(๑´ㅂ`๑)</p>
                                    <p>溝通以文字回覆進行，詢問孩子問題也需要一些時間</p>
                                    <p>如果超過4題以上想要詢問的話，建議預約1小時喔</p>
                                    <p className="text-[#FA8C76]">希望我們能夠與毛孩一起舒適地聊天❤️</p>
                                </div>
                                <div className="space-y-3">
                                    {planOpts.map(opt => (
                                        <label key={opt} className="flex items-center gap-3 cursor-pointer">
                                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${formData.plan === opt ? 'border-[#FA8C76]' : 'border-gray-300'}`}>
                                                {formData.plan === opt && <div className="w-3 h-3 bg-[#FA8C76] rounded-full"></div>}
                                            </div>
                                            <input type="radio" name="plan" value={opt} checked={formData.plan === opt} onChange={handleInputChange} className="hidden"/>
                                            <span className="text-sm text-[#5D5550]">{opt}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </section>

                        <div className="h-px bg-[#F0EAE6] w-full"></div>

                        {/* 1. Time Slot Selection (Moved Here) */}
                        <section>
                            <label className="block text-sm font-bold text-[#5D5550] mb-2">
                                {formPrompts.time} <span className="text-red-400">*</span>
                            </label>
                            {slotNote && (
                                <p className="text-xs text-[#8D8580] mb-2 leading-relaxed whitespace-pre-line">
                                    {slotNote}
                                </p>
                            )}
                            <p className="text-xs text-[#8D8580] mb-4 leading-relaxed">
                                *如果有其他想要時間，可以與溫妮討論看看喔!<br/>
                                *候補為已暫訂預約，若原預約人未完成預訂或是取消將會開放遞補
                            </p>
                            
                            <div className="flex flex-col gap-2">
                                {slots.length === 0 ? (
                                    <div className="text-center py-8 text-[#A8A09B] bg-[#F9F7F5] rounded-2xl border border-dashed border-[#E3DCD8]">
                                        目前沒有開放的時段
                                    </div>
                                ) : (
                                    slots.map(slot => (
                                        <button
                                            type="button"
                                            key={slot.id}
                                            disabled={slot.isFull && !slot.isWaitlist}
                                            onClick={() => toggleSlotSelection(slot.id)}
                                            className={`
                                                relative p-4 rounded-xl border text-left transition-all duration-300 flex items-center justify-between group gap-4
                                                ${selectedSlotIds.includes(slot.id) 
                                                    ? 'border-[#FA8C76] bg-[#FA8C76] text-white shadow-md' 
                                                    : 'border-[#F0EAE6] hover:border-[#FA8C76]/50 bg-[#FBF9F8] text-[#5D5550]'}
                                                ${(slot.isFull && !slot.isWaitlist) ? 'opacity-40 cursor-not-allowed bg-gray-100 grayscale' : ''}
                                            `}
                                        >
                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${selectedSlotIds.includes(slot.id) ? 'bg-white border-white' : 'border-gray-300 bg-white'}`}>
                                                    {selectedSlotIds.includes(slot.id) && <Check className="w-3.5 h-3.5 text-[#FA8C76]"/>}
                                                </div>
                                                <span className="font-mono text-sm truncate">{formatDateWithWeek(slot.date)} {slot.time}</span>
                                            </div>
                                            
                                            {slot.isFull ? (
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-200 text-gray-500 shrink-0">額滿</span>
                                            ) : slot.isWaitlist ? (
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-yellow-100 text-yellow-700 shrink-0">候補</span>
                                            ) : null}
                                        </button>
                                    ))
                                )}
                            </div>
                        </section>

                        <div className="h-px bg-[#F0EAE6] w-full"></div>

                        {/* 7. Reiki */}
                        {!formData.plan.includes('離世') ? (
                            <section className="space-y-4">
                                <div className="bg-[#E8F8F5] p-2 rounded-lg text-center font-bold text-[#2D7A6E] text-sm">
                                    目前有靈氣療癒體驗，<br className="sm:hidden" />凡預約溝通的家長都可以免費參與!
                                </div>
                                
                                <div className="flex items-center justify-between">
                                    <label className="block text-sm font-bold text-[#5D5550]">{formPrompts.reiki} <span className="text-red-400">*</span></label>
                                    <button type="button" onClick={() => setReikiModalOpen(true)} className="text-xs text-[#65D3BB] underline font-bold flex items-center gap-1 hover:text-[#52C2A8]">
                                        <Info className="w-3 h-3"/> 查看靈氣療癒詳細說明
                                    </button>
                                </div>
                                
                                <div className="space-y-3">
                                    {reikiOpts.map(opt => (
                                        <label key={opt} className="flex items-start gap-3 cursor-pointer">
                                            <div className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${formData.reiki === opt ? 'border-[#FA8C76]' : 'border-gray-300'}`}>
                                                {formData.reiki === opt && <div className="w-3 h-3 bg-[#FA8C76] rounded-full"></div>}
                                            </div>
                                            <input type="radio" name="reiki" value={opt} checked={formData.reiki === opt} onChange={handleInputChange} className="hidden"/>
                                            <span className="text-sm text-[#5D5550]">{opt}</span>
                                        </label>
                                    ))}
                                </div>
                            </section>
                        ) : (
                            <section className="bg-gray-50 p-4 rounded-xl text-center text-[#A8A09B] text-sm">
                                離世溝通不適用靈氣體驗
                            </section>
                        )}

                        <div className="h-px bg-[#F0EAE6] w-full"></div>

                        {/* 8. Sharing & Source */}
                        <section className="space-y-6">
                            <div>
                                <label className="block text-sm font-bold text-[#5D5550] mb-2">{formPrompts.sharing} <span className="text-red-400">*</span></label>
                                <p className="text-xs text-[#8D8580] mb-2">*會遮蔽飼主的照片及名字等個人資訊</p>
                                <div className="space-y-3">
                                    {sharingOpts.map(opt => (
                                         <label key={opt} className="flex items-center gap-3 cursor-pointer">
                                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${formData.shareConsent === opt ? 'border-[#FA8C76]' : 'border-gray-300'}`}>
                                                {formData.shareConsent === opt && <div className="w-3 h-3 bg-[#FA8C76] rounded-full"></div>}
                                            </div>
                                            <input type="radio" name="shareConsent" value={opt} checked={formData.shareConsent === opt} onChange={handleInputChange} className="hidden"/>
                                            <span className="text-sm text-[#5D5550]">{opt}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-[#5D5550] mb-2">{formPrompts.source} <span className="text-red-400">*</span></label>
                                <div className="space-y-3">
                                    {sourceOpts.map(opt => (
                                        <label key={opt} className="flex items-center gap-3 cursor-pointer">
                                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${formData.source === opt ? 'border-[#FA8C76]' : 'border-gray-300'}`}>
                                                {formData.source === opt && <div className="w-3 h-3 bg-[#FA8C76] rounded-full"></div>}
                                            </div>
                                            <input type="radio" name="source" value={opt} checked={formData.source === opt} onChange={handleInputChange} className="hidden"/>
                                            <span className="text-sm text-[#5D5550]">{opt}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </section>

                        {/* Final Check */}
                        <div className="bg-[#FFF8F6] rounded-xl p-5 border border-[#FA8C76]/20">
                             <div className="mb-4">
                                 <h4 className="font-bold text-[#5D5550] mb-2">最後確認</h4>
                             </div>
                             
                             <div className="space-y-3">
                                 <label className="flex items-start gap-3 cursor-pointer p-2 rounded hover:bg-[#FFF0EC]/50 transition">
                                     <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 ${formData.agreedToTerms ? 'bg-[#FA8C76] border-[#FA8C76]' : 'border-gray-300'}`}>
                                         {formData.agreedToTerms && <Check className="w-3.5 h-3.5 text-white"/>}
                                     </div>
                                     <input 
                                         type="checkbox" 
                                         checked={formData.agreedToTerms} 
                                         onChange={(e) => setFormData(prev => ({...prev, agreedToTerms: e.target.checked}))}
                                         className="hidden"
                                     />
                                     <span className="text-sm text-[#5D5550]">已了解並同意所有預約流程、預約須知及收費之內容</span>
                                 </label>

                                 <label className="flex items-start gap-3 cursor-pointer p-2 rounded hover:bg-[#FFF0EC]/50 transition">
                                     <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 ${formData.finalConfirmed ? 'bg-[#FA8C76] border-[#FA8C76]' : 'border-gray-300'}`}>
                                         {formData.finalConfirmed && <Check className="w-3.5 h-3.5 text-white"/>}
                                     </div>
                                     <input 
                                         type="checkbox" 
                                         checked={formData.finalConfirmed} 
                                         onChange={(e) => setFormData(prev => ({...prev, finalConfirmed: e.target.checked}))}
                                         className="hidden"
                                     />
                                     <span className="text-sm text-[#5D5550]">會記得追蹤社群並私訊溫妮確認😋</span>
                                 </label>
                             </div>
                        </div>

                        <button 
                            type="submit" 
                            disabled={submitting}
                            className={`w-full py-4 rounded-2xl font-bold text-white text-lg shadow-[0_10px_20px_-10px_rgba(250,140,118,0.5)] transition-all transform hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2
                                ${submitting ? 'bg-[#C0B8B4] cursor-not-allowed' : 'bg-[#FA8C76] hover:bg-[#F27A63]'}`}
                        >
                            {submitting ? '心球連線中...' : '送出預約單'}
                        </button>

                    </form>
                    
                    <div className="pb-8 pt-4 text-center text-[10px] text-[#C0B8B4] tracking-widest uppercase">
                        © 2024 Winii Animal Communication
                    </div>
                </div>
            )}
        </div>
      )}

      {view === 'login' && (
        <div className="min-h-screen bg-[#FFFBF9] flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-[2rem] shadow-xl w-full max-w-sm text-center border-t-8 border-[#FA8C76]">
            <div className="mx-auto bg-[#FFF0EC] w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-sm"><Lock className="text-[#FA8C76] w-8 h-8" /></div>
            <h2 className="text-xl font-bold text-[#5D5550] mb-6">Winii 後台登入</h2>
            <form onSubmit={e => { e.preventDefault(); if(pin === ADMIN_PIN) setView('admin'); else showToast("密碼錯誤", 'error'); }}>
              <input type="password" value={pin} onChange={e => setPin(e.target.value)} className="w-full text-center text-3xl tracking-widest p-4 border border-[#F0EAE6] rounded-2xl mb-4 focus:border-[#FA8C76] outline-none text-[#5D5550] bg-[#FBF9F8]" placeholder="••••" autoFocus />
              <button className="w-full bg-[#FA8C76] text-white font-bold py-4 rounded-2xl hover:bg-[#F27A63] transition shadow-lg shadow-[#FA8C76]/20">登入系統</button>
            </form>
            <button onClick={() => setView('form')} className="mt-6 text-[#A8A09B] text-sm hover:text-[#FA8C76] flex items-center justify-center gap-1 mx-auto transition"><ChevronLeft className="w-4 h-4"/> 回預約表單</button>
          </div>
        </div>
      )}

      {view === 'admin' && (
        <div className="fixed inset-0 bg-[#FFFBF9] font-sans text-[#5D5550] flex flex-col">
          {/* Top Header - App-like fixed header */}
          <header className="flex-none bg-white/80 backdrop-blur-md border-b border-[#FA8C76]/10 px-4 py-3 flex justify-between items-center shadow-sm z-30">
            <div className="flex items-center gap-2 font-bold text-[#5D5550] text-lg">
                <div className="w-8 h-8 bg-[#FA8C76] rounded-lg flex items-center justify-center text-white">
                    <Heart className="w-4 h-4 fill-current"/>
                </div> 
                <span>Winii's Admin</span>
            </div>
            
            {/* Desktop Tabs - Visible only on MD+ */}
            <div className="hidden md:flex gap-1 bg-[#FBF9F8] p-1 rounded-xl border border-[#F0EAE6]">
               <button onClick={() => setAdminTab('list')} className={`px-3 py-1.5 text-sm rounded-lg transition flex items-center ${adminTab === 'list' ? 'bg-white text-[#FA8C76] font-bold shadow-sm' : 'text-[#A8A09B] hover:text-[#5D5550]'}`}><List className="w-4 h-4 mr-1"/>列表</button>
               <button onClick={() => setAdminTab('calendar')} className={`px-3 py-1.5 text-sm rounded-lg transition flex items-center ${adminTab === 'calendar' ? 'bg-white text-[#FA8C76] font-bold shadow-sm' : 'text-[#A8A09B] hover:text-[#5D5550]'}`}><Calendar className="w-4 h-4 mr-1"/>行事曆</button>
               <button onClick={() => setAdminTab('slots')} className={`px-3 py-1.5 text-sm rounded-lg transition flex items-center ${adminTab === 'slots' ? 'bg-white text-[#FA8C76] font-bold shadow-sm' : 'text-[#A8A09B] hover:text-[#5D5550]'}`}><Settings className="w-4 h-4 mr-1"/>時段</button>
               <button onClick={() => setAdminTab('settings')} className={`px-3 py-1.5 text-sm rounded-lg transition flex items-center ${adminTab === 'settings' ? 'bg-white text-[#FA8C76] font-bold shadow-sm' : 'text-[#A8A09B] hover:text-[#5D5550]'}`}><Pencil className="w-4 h-4 mr-1"/>表單</button>
               <button onClick={() => setAdminTab('trash')} className={`px-3 py-1.5 text-sm rounded-lg transition flex items-center ${adminTab === 'trash' ? 'bg-red-50 text-red-500 font-bold shadow-sm' : 'text-[#A8A09B] hover:text-red-400'}`}><XCircle className="w-4 h-4 mr-1"/>無效</button>
            </div>

            <button onClick={() => { setView('form'); setPin(''); }} className="p-2 rounded-full text-[#A8A09B] hover:bg-[#FFF0EC] hover:text-[#FA8C76] transition">
                <LogOut className="w-5 h-5"/>
            </button>
          </header>

          {/* Main Scrollable Content Area */}
          <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8 scroll-smooth no-scrollbar">
             <div className="max-w-5xl mx-auto w-full">
             
             {adminTab === 'list' && (
               <div className="space-y-6">
                 {/* Status Filters */}
                 <div className="flex items-center justify-between overflow-x-auto pb-2 gap-4 no-scrollbar">
                    <div className="flex gap-2 p-1 bg-white rounded-xl border border-[#F0EAE6] shadow-sm">
                       {['pending_payment', 'booked', 'completed'].map((status) => (
                           <button 
                             key={status}
                             onClick={() => setListFilter(status as Status)} 
                             className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 whitespace-nowrap
                               ${listFilter === status 
                                  ? (status === 'pending_payment' ? 'bg-[#FA8C76] text-white' : status === 'booked' ? 'bg-[#F4A261] text-white' : 'bg-[#65D3BB] text-white')
                                  : 'text-[#A8A09B] hover:bg-[#FBF9F8]'}`}
                           >
                              {status === 'pending_payment' && '待匯款'}
                              {status === 'booked' && '已預約'}
                              {status === 'completed' && '已完成'}
                              <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px]">
                                {status === 'pending_payment' ? counts.pending : status === 'booked' ? counts.booked : counts.completed}
                              </span>
                           </button>
                       ))}
                    </div>
                    <button onClick={downloadCSV} className="bg-[#5D5550] text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-[#4A4440] shadow-md whitespace-nowrap"><Download className="w-4 h-4"/> 匯出報表</button>
                 </div>

                 {Object.keys(filteredApps).sort().map(month => (
                    <div key={month} className="space-y-4">
                        <div 
                            className="flex items-center gap-4 cursor-pointer hover:bg-gray-50 p-2 rounded-lg transition"
                            onClick={() => toggleMonthCollapse(month)}
                        >
                            {collapsedMonths.includes(month) ? <ChevronRight className="w-5 h-5 text-gray-400"/> : <ChevronDown className="w-5 h-5 text-gray-400"/>}
                            <h3 className="text-xl font-bold text-[#5D5550]">{month}</h3>
                            <div className="h-px flex-1 bg-[#F0EAE6]"></div>
                            
                            {/* Conditional Total Display - Only show for 'completed' filter */}
                            {listFilter === 'completed' && (
                                <span className="text-sm font-bold text-[#FA8C76] bg-[#FFF0EC] px-3 py-1 rounded-lg flex items-center gap-2">
                                    <span>月收: ${calculateMonthTotal(appointments.filter(a => {
                                      const d = getSafeDate(a.date);
                                      const key = d ? `${d.getFullYear()}年 ${d.getMonth() + 1}月` : '未定日期';
                                      return key === month;
                                    }))}</span>
                                    <span className="text-[#A8A09B] font-normal border-l border-[#FA8C76]/30 pl-2">
                                        (共 {appointments.filter(a => {
                                            const d = getSafeDate(a.date);
                                            const key = d ? `${d.getFullYear()}年 ${d.getMonth() + 1}月` : '未定日期';
                                            return key === month && a.status === 'completed';
                                        }).length} 筆)
                                    </span>
                                </span>
                            )}
                        </div>
                        
                        {/* Collapsible Content */}
                        {!collapsedMonths.includes(month) && (
                            <div className="grid gap-4 animate-in fade-in slide-in-from-top-2">
                                {filteredApps[month].map(app => (
                                    <div key={app.id} className="bg-white p-5 rounded-2xl shadow-sm border border-[#F0EAE6] hover:shadow-md transition group flex flex-col md:flex-row gap-4 relative overflow-hidden md:items-center">
                                        <div className={`absolute top-0 left-0 w-1.5 h-full ${app.status === 'pending_payment' ? 'bg-[#FA8C76]' : app.status === 'booked' ? 'bg-[#F4A261]' : 'bg-[#65D3BB]'}`}></div>
                                        
                                        {/* Reminded Icon - Absolute Top Right */}
                                        {app.isReminded && app.status === 'pending_payment' && (
                                            <div className="absolute top-3 right-3 animate-pulse">
                                                <div className="bg-purple-100 p-2 rounded-full shadow-sm border border-purple-200">
                                                    <Bell className="w-5 h-5 text-purple-500 fill-current"/>
                                                </div>
                                            </div>
                                        )}

                                        {/* Date Block - Updated for Mobile Header Style - Fixed Square */}
                                        <div className="flex w-full flex-row md:flex-col items-center justify-center md:w-32 gap-3 p-3 bg-[#FBF9F8] rounded-xl text-center cursor-pointer hover:bg-[#FFF0EC] transition shrink-0 border border-[#F0EAE6]" onClick={() => openDateEditModal(app)}>
                                            <div className="flex items-center gap-2 md:block">
                                                <div className="text-lg md:text-xl font-bold text-[#5D5550]">
                                                    {formatShortDate(app.date)}
                                                </div>
                                                <div className="text-sm font-bold text-[#A8A09B]">
                                                    {getWeekDayOnly(app.date)}
                                                </div>
                                            </div>
                                            <div className="text-lg md:text-xl font-bold text-[#FA8C76] md:mt-1">{app.time}</div>
                                        </div>

                                        {/* Info Block - ALL Fields Parallel - Vertical Stack */}
                                        <div className="flex-1 space-y-3">
                                            <div className="flex items-start justify-between pr-10"> {/* pr-10 to avoid overlap with Reminded icon */}
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <h4 className="text-lg font-bold text-[#5D5550]">{app.ownerName} <span className="text-xs font-normal text-[#A8A09B]">({app.petRelation})</span></h4>
                                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${app.customerType === '老朋友' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-50 text-blue-600'}`}>{app.customerType}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-sm text-[#8D8580] mt-1">
                                                        <span>{app.petSpecies} {app.petAge}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex flex-col gap-2 text-xs text-[#5D5550]">
                                                 <div className="flex items-center gap-2 mb-1"><DollarSign className="w-4 h-4 text-orange-500"/> 
                                                    <span className="text-lg font-bold text-[#FA8C76]">${extractPrice(app)}</span>
                                                    <button onClick={() => openPriceEditModal(app)} className="text-[#A8A09B] hover:text-[#5D5550] p-1"><Pencil className="w-3 h-3"/></button>
                                                 </div>
                                                 
                                                 {/* Vertical Stack List */}
                                                 <div className="flex items-center gap-2 break-all"><Instagram className="w-4 h-4 text-pink-500 shrink-0"/> {app.instagramId}</div>
                                                 <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-blue-500 shrink-0"/> {app.plan}</div>
                                                 <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-purple-500 shrink-0"/> {getReikiDisplay(app.reiki)}</div>
                                                 <div className="flex items-center gap-2"><Share2 className="w-4 h-4 text-indigo-500 shrink-0"/> 分享意願: {app.shareConsent}</div>
                                                 <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-red-400 shrink-0"/> {app.source}</div>
                                            </div>

                                            {/* Selected Slots Display */}
                                            <div className="mt-2 p-2 bg-gray-50 rounded-lg text-xs">
                                                <span className="font-bold text-[#5D5550] block mb-1">客戶勾選時段:</span>
                                                <div className="flex flex-wrap gap-2">
                                                    {app.selectedSlots && app.selectedSlots.length > 0 ? (
                                                        app.selectedSlots.map(s => (
                                                            <span key={s.id} className="bg-white border border-[#E3DCD8] px-2 py-1 rounded text-[#5D5550]">
                                                                {formatDateWithWeek(s.date)} {s.time} {s.isWaitlist ? '(候補)' : ''}
                                                            </span>
                                                        ))
                                                    ) : (
                                                        <span>{formatDateWithWeek(app.date)} {app.time}</span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Questions Preview */}
                                            {app.questions && (
                                                <div className="bg-[#FFFBF9] border border-[#F0EAE6] p-2 rounded-lg text-xs text-[#8D8580] italic mt-2 line-clamp-2">
                                                    " {app.questions} "
                                                </div>
                                            )}
                                            
                                            {/* Admin Note */}
                                            <div className="flex items-center gap-2 mt-2 cursor-pointer group/note" onClick={() => openNoteEditModal(app)}>
                                                <StickyNote className="w-4 h-4 text-yellow-400 fill-yellow-100"/>
                                                <span className="text-xs text-[#A8A09B] group-hover/note:text-[#5D5550] transition truncate max-w-md">
                                                    {app.adminNotes || '點擊新增備註...'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Actions - Grid on Mobile, Column on Desktop */}
                                        <div className="grid grid-cols-2 md:flex md:flex-col gap-2 justify-center border-t md:border-t-0 md:border-l border-[#F0EAE6] pt-4 md:pt-0 md:pl-4">
                                            {app.status === 'pending_payment' && (
                                                <>
                                                    <button onClick={(e) => { e.stopPropagation(); openPaymentModal(app); }} className="p-2 rounded-xl bg-blue-50 text-blue-500 hover:bg-blue-100 transition flex items-center justify-center gap-1 font-bold text-xs"><MessageSquare className="w-4 h-4"/> 匯款資訊</button>
                                                    <button onClick={() => markAsReminded(app)} className={`p-2 rounded-xl transition flex items-center justify-center gap-1 font-bold text-xs ${app.isReminded ? 'bg-purple-100 text-purple-500' : 'bg-purple-50 text-purple-400 hover:bg-purple-100'}`}><Bell className="w-4 h-4"/> 提醒匯款</button>
                                                    <button onClick={() => updateStatus(app.id, 'booked')} className="col-span-2 md:col-span-1 p-2 rounded-xl bg-[#FA8C76] text-white hover:bg-[#F27A63] transition flex items-center justify-center gap-1 font-bold text-xs"><Check className="w-4 h-4"/> 確認收款</button>
                                                </>
                                            )}
                                            {app.status === 'booked' && (
                                                <>
                                                    <button onClick={() => updateStatus(app.id, 'completed')} className="col-span-2 md:col-span-1 p-2 rounded-xl bg-[#65D3BB] text-white hover:bg-[#52C2A8] transition flex items-center justify-center gap-1 font-bold text-xs"><CheckCircle className="w-4 h-4"/> 完成</button>
                                                    <button onClick={() => updateStatus(app.id, 'pending_payment')} className="col-span-2 md:col-span-1 p-2 rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 transition flex items-center justify-center gap-1 font-bold text-xs"><Undo2 className="w-4 h-4"/> 回復待匯款</button>
                                                </>
                                            )}
                                            {app.status === 'completed' && (
                                                <button onClick={() => updateStatus(app.id, 'booked')} className="col-span-2 md:col-span-1 p-2 rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 transition flex items-center justify-center gap-1 font-bold text-xs"><Undo2 className="w-4 h-4"/> 回復已預約</button>
                                            )}
                                            <button onClick={(e) => initiateDelete(e, app.id)} className="col-span-2 md:col-span-1 p-2 rounded-xl text-[#A8A09B] hover:bg-red-50 hover:text-red-500 transition flex items-center justify-center gap-1 font-bold text-xs mt-2 md:mt-0"><Trash2 className="w-4 h-4"/> 刪除預約</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                 ))}
               </div>
             )}

             {adminTab === 'slots' && (
               <div className="space-y-6">
                 <div className="bg-white p-6 rounded-2xl shadow-sm border border-[#F0EAE6] flex flex-col md:flex-row gap-4 items-end">
                    <div className="w-full md:w-auto">
                        <label className="block text-xs font-bold text-[#A8A09B] mb-1">日期</label>
                        <input type="date" value={newSlotDate} onChange={e => setNewSlotDate(e.target.value)} className="w-full border border-[#F0EAE6] rounded-xl p-2.5 bg-[#FBF9F8] outline-none focus:border-[#FA8C76]" />
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                        <div className="flex-1">
                             <label className="block text-xs font-bold text-[#A8A09B] mb-1">時</label>
                             <select value={newSlotHour} onChange={e => setNewSlotHour(e.target.value)} className="w-full border border-[#F0EAE6] rounded-xl p-2.5 bg-[#FBF9F8] outline-none">
                                {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                             </select>
                        </div>
                        <div className="flex-1">
                             <label className="block text-xs font-bold text-[#A8A09B] mb-1">分</label>
                             <select value={newSlotMinute} onChange={e => setNewSlotMinute(e.target.value)} className="w-full border border-[#F0EAE6] rounded-xl p-2.5 bg-[#FBF9F8] outline-none">
                                {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
                             </select>
                        </div>
                    </div>
                    <button onClick={addSlot} className="w-full md:w-auto px-6 py-2.5 bg-[#FA8C76] text-white rounded-xl font-bold hover:bg-[#F27A63] transition shrink-0">新增時段</button>
                 </div>
                 
                 <div className="bg-white p-6 rounded-2xl shadow-sm border border-[#F0EAE6]">
                     <div className="flex items-center gap-2 mb-4">
                        <Settings className="w-5 h-5 text-[#FA8C76]" />
                        <h3 className="font-bold text-[#5D5550]">時段管理</h3>
                     </div>
                     <div className="flex flex-col gap-2">
                        {slots.map(slot => (
                            <div key={slot.id} className={`relative p-4 rounded-xl border ${slot.isFull ? 'bg-gray-50 border-gray-200' : 'bg-white border-[#F0EAE6]'} flex items-center justify-between group`}>
                                <div className="flex items-center gap-4">
                                    <div className="font-bold text-[#5D5550]">{formatShortDate(slot.date)}</div>
                                    <div className="text-sm text-[#A8A09B] font-mono">({['日','一','二','三','四','五','六'][new Date(slot.date).getDay()]})</div>
                                    <div className="text-lg font-bold text-[#FA8C76]">{slot.time}</div>
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => toggleSlotFull(slot)} 
                                        className={`w-10 h-10 rounded-lg flex items-center justify-center transition text-lg ${slot.isFull ? 'bg-[#5D5550] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                        title={slot.isFull ? "設為未滿" : "設為額滿"}
                                    >
                                        {slot.isFull ? '🔒' : '🔓'}
                                    </button>
                                    <button 
                                        onClick={() => toggleSlotWaitlist(slot)} 
                                        className={`w-10 h-10 rounded-lg flex items-center justify-center transition text-lg ${slot.isWaitlist ? 'bg-yellow-400 text-white' : 'bg-yellow-50 text-yellow-600 hover:bg-yellow-100'}`}
                                        title={slot.isWaitlist ? "取消候補" : "設為候補"}
                                    >
                                        ⏳
                                    </button>
                                    <button 
                                        onClick={(e) => initiateSlotDelete(e, slot.id)} 
                                        className="w-10 h-10 rounded-lg bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition flex items-center justify-center text-lg"
                                        title="刪除"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        ))}
                     </div>
                 </div>

                 <div className="bg-white p-6 rounded-2xl shadow-sm border border-[#F0EAE6]">
                      <h3 className="font-bold text-[#5D5550] mb-4">預約說明</h3>
                      <textarea value={slotNote} onChange={e => setSlotNote(e.target.value)} className="w-full h-32 border border-[#F0EAE6] rounded-xl p-3 bg-[#FBF9F8] outline-none focus:border-[#FA8C76] mb-4" />
                      <button onClick={saveSlotNote} className="px-6 py-2 bg-[#65D3BB] text-white rounded-xl font-bold hover:bg-[#52C2A8]">儲存公告</button>
                 </div>
               </div>
             )}

             {adminTab === 'settings' && (
                 <div className="space-y-6">
                     {/* Google Forms Style Editor */}
                     <div className="space-y-4">
                         {formSections.map((section, idx) => (
                             <div 
                                 key={section.id} 
                                 onClick={() => setActiveSettingSection(section.id)}
                                 className={`bg-white rounded-2xl shadow-sm border transition-all duration-200 overflow-hidden
                                     ${activeSettingSection === section.id ? 'border-l-8 border-l-[#FA8C76] border-y-[#FA8C76]/20 border-r-[#FA8C76]/20 ring-1 ring-[#FA8C76]/10' : 'border-[#F0EAE6] border-l-8 border-l-transparent hover:border-[#FA8C76]/30'}
                                 `}
                             >
                                 <div className="p-6">
                                     <div className="flex flex-col gap-4">
                                         {/* Question Title Input */}
                                         <div className="flex items-start gap-4">
                                             <div className="flex-1">
                                                 <label className="text-xs font-bold text-[#A8A09B] mb-1 block uppercase tracking-wider">問題標題</label>
                                                 <input 
                                                     value={formPrompts[section.id as keyof typeof DEFAULT_PROMPTS] || ''} 
                                                     onChange={(e) => handlePromptChange(section.id as any, e.target.value)}
                                                     onBlur={savePrompts}
                                                     className="w-full text-lg font-bold text-[#5D5550] border-b border-[#E3DCD8] py-2 focus:border-[#FA8C76] outline-none bg-transparent transition-colors placeholder:text-gray-300"
                                                     placeholder={section.label}
                                                 />
                                             </div>
                                             {/* Type Indicator (Visual only mostly) */}
                                             <div className="hidden md:block w-32 border border-[#E3DCD8] rounded-lg px-3 py-2 text-xs text-[#8D8580] bg-[#FBF9F8]">
                                                 {section.type === 'text' ? '簡答文字' : '單選選項'}
                                             </div>
                                         </div>

                                         {/* Options Editor (if applicable) */}
                                         {section.type === 'options' && section.optionKey && (
                                             <div className="pl-4 border-l-2 border-[#F0EAE6] mt-2 space-y-3">
                                                 <div className="space-y-2">
                                                     {(section.options || []).map((opt, optIdx) => (
                                                         <div key={optIdx} className="flex items-center gap-2 group">
                                                             <div className="w-4 h-4 rounded-full border border-[#D1CCC8] shrink-0"></div>
                                                             {/* Option Input Field */}
                                                             <input 
                                                                 className="flex-1 text-sm text-[#5D5550] py-1 border-b border-transparent focus:border-[#FA8C76] outline-none bg-transparent hover:border-[#E3DCD8] transition-colors"
                                                                 value={opt}
                                                                 onChange={(e) => handleOptionChange(section.optionKey as any, optIdx, e.target.value)}
                                                                 onBlur={() => handleOptionBlur(section.optionKey as any)}
                                                             />
                                                             <button 
                                                                 onClick={() => removeOptionByIndex(section.optionKey as any, optIdx)}
                                                                 className="p-1 text-[#D1CCC8] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                                             >
                                                                 <X size={16} />
                                                             </button>
                                                         </div>
                                                     ))}
                                                 </div>
                                                 
                                                 {/* Add New Option */}
                                                 <div className="flex items-center gap-2 pt-1">
                                                     <div className="w-4 h-4 rounded-full border border-[#D1CCC8] shrink-0"></div>
                                                     <input 
                                                         placeholder={`新增${section.label.replace('題', '')}選項...`}
                                                         className="flex-1 text-sm border-b border-transparent focus:border-[#FA8C76] outline-none py-1 bg-transparent hover:border-[#E3DCD8] transition-colors"
                                                         value={newOptionInput}
                                                         onChange={(e) => {
                                                             if(activeSettingSection === section.id) setNewOptionInput(e.target.value);
                                                         }}
                                                         onFocus={() => setActiveSettingSection(section.id)}
                                                         onKeyDown={(e) => {
                                                             if (e.key === 'Enter' && newOptionInput.trim()) {
                                                                 addOptionToType(section.optionKey as any, newOptionInput);
                                                                 setNewOptionInput('');
                                                             }
                                                         }}
                                                     />
                                                     {newOptionInput && activeSettingSection === section.id && (
                                                         <button 
                                                             onClick={() => {
                                                                 addOptionToType(section.optionKey as any, newOptionInput);
                                                                 setNewOptionInput('');
                                                             }}
                                                             className="text-xs font-bold text-[#FA8C76]"
                                                         >
                                                             新增
                                                         </button>
                                                     )}
                                                 </div>
                                             </div>
                                         )}
                                     </div>
                                 </div>
                                 
                                 {/* Card Footer Actions */}
                                 {activeSettingSection === section.id && (
                                     <div className="px-6 py-3 bg-[#FBF9F8] border-t border-[#F0EAE6] flex justify-end gap-4 text-[#A8A09B]">
                                         <button className="p-2 hover:bg-[#F0EAE6] rounded-full transition"><Copy size={18}/></button>
                                         <button className="p-2 hover:bg-[#F0EAE6] rounded-full transition"><Trash size={18}/></button>
                                         <div className="w-px h-6 bg-[#E3DCD8] my-auto"></div>
                                         <div className="flex items-center gap-2 text-xs font-bold">
                                             <span>必填</span>
                                             <div className="w-8 h-4 bg-[#FA8C76] rounded-full relative cursor-pointer">
                                                 <div className="absolute right-0.5 top-0.5 w-3 h-3 bg-white rounded-full shadow-sm"></div>
                                             </div>
                                         </div>
                                     </div>
                                 )}
                             </div>
                         ))}
                     </div>
                 </div>
             )}

             {adminTab === 'calendar' && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-[#F0EAE6] overflow-hidden">
                    <div className="flex items-center justify-between mb-6">
                        <button onClick={prevMonth}><ChevronLeft className="w-6 h-6 text-[#A8A09B] hover:text-[#FA8C76]"/></button>
                        <h2 className="text-xl font-bold text-[#5D5550]">{calDate.getFullYear()}年 {calDate.getMonth() + 1}月</h2>
                        <button onClick={nextMonth}><ChevronRight className="w-6 h-6 text-[#A8A09B] hover:text-[#FA8C76]"/></button>
                    </div>
                    
                    {/* Compact Calendar Grid */}
                    <div className="grid grid-cols-7 gap-1 mb-4">
                        {['日','一','二','三','四','五','六'].map(d => <div key={d} className="text-center text-xs font-bold text-[#A8A09B] py-2">{d}</div>)}
                        {calendarGrid.map((date, i) => {
                            if(!date) return <div key={i} className="aspect-square bg-transparent"></div>;
                            const dayApps = getDayAppointments(date);
                            const isSelected = selectedDate && date.toDateString() === selectedDate.toDateString();
                            const isToday = date.toDateString() === new Date().toDateString();
                            
                            return (
                                <div 
                                    key={i} 
                                    onClick={() => setSelectedDate(date)}
                                    className={`
                                        aspect-square rounded-xl p-1 flex flex-col items-center justify-start cursor-pointer transition relative
                                        ${isSelected ? 'bg-[#FA8C76] shadow-md scale-95' : 'bg-[#FBF9F8] border border-[#F0EAE6] hover:bg-[#FFF0EC]'}
                                    `}
                                >
                                    <span className={`text-xs font-bold mb-1 ${isSelected ? 'text-white' : (isToday ? 'text-[#FA8C76]' : 'text-[#5D5550]')}`}>
                                        {date.getDate()}
                                    </span>
                                    
                                    {/* Status Dots */}
                                    <div className="flex gap-0.5 flex-wrap justify-center content-start w-full px-1">
                                        {dayApps.slice(0, 4).map((a, idx) => (
                                            <div 
                                                key={idx} 
                                                className={`w-1.5 h-1.5 rounded-full ${a.status === 'booked' ? 'bg-[#F4A261]' : a.status === 'completed' ? 'bg-[#65D3BB]' : 'bg-[#FA8C76]'} ${isSelected ? 'ring-1 ring-white' : ''}`}
                                            ></div>
                                        ))}
                                        {dayApps.length > 4 && <div className="text-[8px] text-[#A8A09B] leading-none">+</div>}
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* Selected Date Details */}
                    <div className="mt-6 border-t border-[#F0EAE6] pt-6 animate-in fade-in slide-in-from-bottom-4">
                        <h3 className="font-bold text-[#5D5550] mb-4 flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-[#FA8C76]" />
                            {selectedDate.getMonth() + 1}月{selectedDate.getDate()}日 的預約
                            <span className="text-xs text-[#A8A09B] font-normal ml-auto bg-[#FBF9F8] px-2 py-1 rounded-lg">
                                {getDayAppointments(selectedDate).length} 筆資料
                            </span>
                        </h3>
                        
                        <div className="space-y-3">
                            {getDayAppointments(selectedDate).length === 0 ? (
                                <div className="text-center py-8 text-[#A8A09B] bg-[#F9F7F5] rounded-xl border border-dashed border-[#E3DCD8]">
                                    當日無預約
                                </div>
                            ) : (
                                getDayAppointments(selectedDate).map(a => {
                                    const duration = extractDuration(a.plan);
                                    const isReiki = a.reiki.includes('體驗') && !a.reiki.includes('不須') && !a.reiki.includes('不需要');
                                    
                                    return (
                                        <div key={a.id} onClick={() => setViewAppModal(a)} className="bg-white p-4 rounded-xl border border-[#F0EAE6] shadow-sm hover:shadow-md transition cursor-pointer flex items-center gap-4">
                                            <div className={`w-1.5 self-stretch rounded-full ${a.status === 'booked' ? 'bg-[#F4A261]' : a.status === 'completed' ? 'bg-[#65D3BB]' : 'bg-[#FA8C76]'}`}></div>
                                            
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-lg font-bold text-[#5D5550]">{a.time}</span>
                                                    <span className="text-xs text-[#A8A09B] bg-gray-100 px-2 py-0.5 rounded-full">{duration ? `${duration}m` : ''}</span>
                                                    {isReiki && <Sparkles size={14} className="text-purple-400 fill-purple-100"/>}
                                                </div>
                                                <div className="text-sm font-bold text-[#5D5550] truncate">{a.ownerName} <span className="font-normal text-[#A8A09B]">({a.petSpecies})</span></div>
                                            </div>
                                            
                                            <div className="text-right">
                                                <div className={`text-xs font-bold px-2 py-1 rounded-lg ${a.status === 'booked' ? 'bg-orange-100 text-orange-600' : a.status === 'completed' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                                    {a.status === 'booked' ? '已預約' : a.status === 'completed' ? '已完成' : '待匯款'}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
             )}
             
             {adminTab === 'trash' && (
               <div className="bg-white rounded-2xl shadow-sm border border-[#F0EAE6] overflow-hidden">
                   <div className="p-4 border-b border-[#F0EAE6] bg-[#FBF9F8] flex flex-col md:flex-row md:items-center justify-between gap-2">
                       <div className="text-[#5D5550] font-bold text-lg flex items-center gap-2">
                           <AlertTriangle className="text-[#FA8C76]" size={20} />
                           無效預約
                           <span className="text-xs font-normal text-[#8D8580] bg-gray-100 px-2 py-0.5 rounded-full">(沒有在時間內付款的)</span>
                       </div>
                       
                       <div className="flex items-center gap-2 w-full md:w-auto mt-2 md:mt-0">
                           {deletedAppointments.length > 0 && (
                               <button 
                                   onClick={clearAllTrash}
                                   className="px-4 py-2 bg-red-500 text-white text-sm font-bold rounded-xl hover:bg-red-600 transition flex items-center justify-center gap-2 shadow-sm whitespace-nowrap"
                               >
                                   <Trash2 className="w-4 h-4" />
                                   清空垃圾桶
                               </button>
                           )}
                           <div className="text-xs text-[#A8A09B] md:hidden">此處資料可還原或永久刪除</div>
                       </div>
                   </div>
                   
                   {deletedAppointments.length === 0 ? (
                       <div className="p-12 text-center text-[#A8A09B] flex flex-col items-center gap-3">
                           <Trash2 className="w-12 h-12 opacity-20" />
                           <p>目前沒有無效預約記錄</p>
                       </div>
                   ) : (
                       <div className="divide-y divide-[#F0EAE6]">
                           {deletedAppointments.map(app => (
                               <div key={app.id} className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between hover:bg-red-50/10 transition gap-4">
                                   <div className="flex-1 w-full">
                                       <div className="flex items-center gap-2 mb-1">
                                           <span className="font-bold text-[#5D5550] text-lg">{app.ownerName}</span>
                                           <span className="text-xs text-[#A8A09B] bg-gray-100 px-2 py-0.5 rounded-full">{app.petSpecies}</span>
                                       </div>
                                       <div className="text-sm text-[#8D8580] flex flex-wrap gap-x-4 gap-y-1">
                                           <span className="flex items-center gap-1"><Calendar className="w-3 h-3"/> {formatShortDate(app.date)}</span>
                                           <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {app.time}</span>
                                           <span className="flex items-center gap-1"><FileText className="w-3 h-3"/> {app.plan}</span>
                                       </div>
                                       {app.adminNotes && <div className="text-xs text-[#A8A09B] mt-1 bg-yellow-50 p-1 rounded inline-block">備註: {app.adminNotes}</div>}
                                   </div>
                                   
                                   <div className="flex items-center gap-2 w-full md:w-auto mt-2 md:mt-0">
                                       <button 
                                         onClick={() => restoreDeletedApp(app)}
                                         className="flex-1 md:flex-none px-4 py-2 bg-[#65D3BB] text-white text-sm font-bold rounded-xl hover:bg-[#52C2A8] transition flex items-center justify-center gap-2 shadow-sm"
                                       >
                                         <Undo2 className="w-4 h-4" />
                                         <span className="whitespace-nowrap">還原</span>
                                       </button>
                                       <button 
                                         onClick={() => permanentlyDeleteApp(app.id)}
                                         className="flex-none px-3 py-2 bg-red-100 text-red-500 text-sm font-bold rounded-xl hover:bg-red-200 transition flex items-center justify-center shadow-sm"
                                         title="永久刪除"
                                       >
                                         <Trash2 className="w-4 h-4" />
                                       </button>
                                   </div>
                               </div>
                           ))}
                       </div>
                   )}
               </div>
             )}

             </div>
          </main>

          {/* Mobile Bottom Navigation - Fixed at bottom, visible only on mobile */}
          <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#FA8C76]/10 px-6 py-2 flex justify-between items-center z-40 shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.05)] pb-safe">
              <NavButton active={adminTab === 'list'} icon={List} label="列表" onClick={() => setAdminTab('list')} />
              <NavButton active={adminTab === 'calendar'} icon={Calendar} label="行事曆" onClick={() => setAdminTab('calendar')} />
              <NavButton active={adminTab === 'slots'} icon={Settings} label="時段" onClick={() => setAdminTab('slots')} />
              <NavButton active={adminTab === 'settings'} icon={Pencil} label="表單" onClick={() => setAdminTab('settings')} />
              <NavButton active={adminTab === 'trash'} icon={XCircle} label="無效" onClick={() => setAdminTab('trash')} />
          </nav>
        </div>
      )}
      
      {/* Modals placed outside view conditions so they work everywhere */}
           {/* Date Edit Modal */}
           {dateEditModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#5D5550]/20 backdrop-blur-sm animate-in fade-in">
              <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden p-6 space-y-4">
                  <h3 className="font-bold text-[#5D5550] text-center text-lg">修改時間</h3>
                  <input type="date" value={tempDate} onChange={e => setTempDate(e.target.value)} className="w-full border border-[#F0EAE6] rounded-xl p-3 focus:border-[#FA8C76] outline-none text-center" />
                  
                  {/* Custom Time Picker */}
                  <div className="flex gap-2 items-center">
                      <select value={tempHour} onChange={e => setTempHour(e.target.value)} className="flex-1 border border-[#F0EAE6] rounded-xl p-3 focus:border-[#FA8C76] outline-none text-center appearance-none bg-white">
                          {HOURS.map(h => <option key={h} value={h}>{h}時</option>)}
                      </select>
                      <span className="font-bold text-[#5D5550]">:</span>
                      <select value={tempMinute} onChange={e => setTempMinute(e.target.value)} className="flex-1 border border-[#F0EAE6] rounded-xl p-3 focus:border-[#FA8C76] outline-none text-center appearance-none bg-white">
                          {MINUTES.map(m => <option key={m} value={m}>{m}分</option>)}
                      </select>
                  </div>

                  <div className="flex gap-2">
                      <button onClick={() => setDateEditModalOpen(false)} className="flex-1 py-3 rounded-xl bg-[#F0EAE6] text-[#8D8580] font-bold">取消</button>
                      <button onClick={saveFinalDate} className="flex-1 py-3 rounded-xl bg-[#FA8C76] text-white font-bold shadow-lg shadow-[#FA8C76]/20">儲存</button>
                  </div>
              </div>
            </div>
          )}
          
          {/* Note Edit Modal */}
          {noteEditModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#5D5550]/20 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden p-6 space-y-4">
                    <h3 className="font-bold text-[#5D5550] text-center text-lg">管理員備註</h3>
                    <textarea value={tempNoteContent} onChange={e => setTempNoteContent(e.target.value)} className="w-full h-32 border border-[#F0EAE6] rounded-xl p-3 focus:border-[#FA8C76] outline-none resize-none text-sm" placeholder="輸入備註..."></textarea>
                    <div className="flex gap-2">
                        <button onClick={() => setNoteEditModalOpen(false)} className="flex-1 py-3 rounded-xl bg-[#F0EAE6] text-[#8D8580] font-bold">取消</button>
                        <button onClick={saveAdminNote} className="flex-1 py-3 rounded-xl bg-[#FA8C76] text-white font-bold shadow-lg shadow-[#FA8C76]/20">儲存</button>
                    </div>
                </div>
              </div>
          )}

          {/* Price Edit Modal */}
          {priceEditModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#5D5550]/20 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden p-6 space-y-4">
                    <h3 className="font-bold text-[#5D5550] text-center text-lg">修改金額</h3>
                    <input type="number" value={tempPrice} onChange={e => setTempPrice(e.target.value)} className="w-full border border-[#F0EAE6] rounded-xl p-3 focus:border-[#FA8C76] outline-none text-center text-xl font-bold text-[#FA8C76]" />
                    <div className="flex gap-2">
                        <button onClick={() => setPriceEditModalOpen(false)} className="flex-1 py-3 rounded-xl bg-[#F0EAE6] text-[#8D8580] font-bold">取消</button>
                        <button onClick={savePrice} className="flex-1 py-3 rounded-xl bg-[#FA8C76] text-white font-bold shadow-lg shadow-[#FA8C76]/20">儲存</button>
                    </div>
                </div>
              </div>
          )}

          {/* View Appointment Modal (From Calendar) */}
          {viewAppModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#5D5550]/20 backdrop-blur-sm animate-in fade-in">
              <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden p-6 space-y-4 relative">
                  <button onClick={() => setViewAppModal(null)} className="absolute top-4 right-4"><X className="w-5 h-5 text-[#A8A09B]"/></button>
                  <h3 className="font-bold text-[#5D5550] text-center text-lg mb-2">預約詳情</h3>
                  
                  <div className="bg-[#FBF9F8] p-4 rounded-xl text-center mb-4">
                        <div className="text-sm font-bold text-[#A8A09B] uppercase">{formatDateWithWeek(viewAppModal.date).split(' ')[1]}</div>
                        <div className="text-2xl font-bold text-[#5D5550]">{formatShortDate(viewAppModal.date)}</div>
                        <div className="text-xl font-bold text-[#FA8C76]">{viewAppModal.time}</div>
                  </div>

                  <div className="space-y-3 text-sm text-[#5D5550]">
                      <div className="flex items-center gap-2"><User className="w-4 h-4 text-[#A8A09B]"/> {viewAppModal.ownerName} ({viewAppModal.petRelation})</div>
                      <div className="flex items-center gap-2"><Instagram className="w-4 h-4 text-[#A8A09B]"/> {viewAppModal.instagramId}</div>
                      <div className="flex items-center gap-2"><Star className="w-4 h-4 text-[#A8A09B]"/> {viewAppModal.petSpecies} {viewAppModal.petAge}</div>
                      <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-[#A8A09B]"/> {viewAppModal.plan}</div>
                      <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-[#A8A09B]"/> {getReikiDisplay(viewAppModal.reiki)}</div>
                      <div className="flex items-center gap-2"><DollarSign className="w-4 h-4 text-[#A8A09B]"/> ${extractPrice(viewAppModal)}</div>
                  </div>

                  {viewAppModal.questions && (
                        <div className="bg-[#FFFBF9] border border-[#F0EAE6] p-3 rounded-lg text-xs text-[#8D8580] italic mt-2">
                            "{viewAppModal.questions}"
                        </div>
                  )}

                  <div className="flex gap-2 mt-4 pt-4 border-t border-[#F0EAE6]">
                      <button onClick={() => setViewAppModal(null)} className="flex-1 py-2.5 rounded-xl bg-[#F0EAE6] text-[#8D8580] font-bold">關閉</button>
                  </div>
              </div>
            </div>
          )}

          {/* Reiki Info Modal */}
          {reikiModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#5D5550]/20 backdrop-blur-sm animate-in fade-in">
              <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]">
                  <div className="p-4 border-b border-[#F0EAE6] flex justify-between items-center bg-[#FBF9F8]">
                      <h3 className="font-bold text-[#0D5C63]">🌿關於靈氣療癒🌿</h3>
                      <button onClick={() => setReikiModalOpen(false)}><X className="w-5 h-5 text-[#A8A09B]"/></button>
                  </div>
                  <div className="p-6 flex-1 overflow-auto text-sm text-[#5D5550] leading-relaxed space-y-4">
                        <p>靈氣為透過宇宙間本就存在的能量，用雙手傳送給動物，是溫和而細緻的🛀<br/>
                        可協助舒緩情緒，提升身體能量恢復平衡<br/>
                        適合年老/生病/體力下降/容易焦慮/適應新環境的毛孩<br/>
                        作為日常保養也相當合適喔！</p>

                        <p className="font-bold text-[#FA8C76]">⚠️此非藉由通靈或有關宗教/天使等方式，純粹以雙手及照片進行(如同寵物溝通一樣)
                        若對此有疑慮的家長請放心喔！</p>

                        <div className="text-left">
                            <h4 className="font-bold text-[#0D5C63] mb-2">❙ 前置準備</h4>
                            <p>🌹提供毛孩近1個月內近照3-4張(其中一張須有背脊全身照)，眼睛明亮且正視鏡頭，無濾鏡，不可影片截圖<br/>
                            ➡️貓貓：眼睛需要圓圓的照片<br/>
                            ➡️兔子/鼠類／鳥類／刺蝟等：至少需側面全身單眼照片2張+正面1張</p>
                            <br/>
                            <p>🌹請提前至少3天跟毛孩說<br/>
                            「有姐姐會給你暖暖的氣，身體可能會覺得熱熱的，請不要害怕喔！」<br/>
                            並建議在進行時陪伴在毛孩身邊 (若沒有跟溫妮溝通過，孩子可能較容易受驚嚇喔!）</p>
                        </div>

                        <div className="text-left">
                            <h4 className="font-bold text-[#0D5C63] mb-2">❙ 進行時</h4>
                            <p>🌹開始前溫妮會通知家長，全程以遠距及文字回覆的方式進行，療癒時間約為15-20分鐘<br/>
                            🌹與動物溝通不一樣，過程中不會主動和毛孩聊天，可以想像靈氣如同按摩一樣，專注幫助身體能量調整💛</p>
                        </div>

                        <div className="text-left">
                            <h4 className="font-bold text-[#0D5C63] mb-2">❙ 結束後</h4>
                            <p>🌹溫妮會通知家長已結束，請家長觀察寶貝1-3天，以下幾個方向可以看看毛孩👀<br/>
                            ・睡得比較沉、愛打哈欠<br/>
                            ・變得更放鬆或更親人<br/>
                            ・情緒比較穩定或安靜 ・食慾、喝水、排泄有變化</p>
                            <br/>
                            <p>療癒後幾天內，毛孩可能會有以上變化<br/>
                            那是能量在調整釋放的自然反應<br/>
                            只要用平常的方式陪他就好 💛</p>
                            <br/>
                            <p className="font-bold text-[#FA8C76] text-left">🌸暫時沒什麼明顯變化也沒關係也很正常🌸</p>
                        </div>

                        <div className="bg-[#F0FDF9] p-4 rounded-xl text-left">
                            <h4 className="font-bold text-[#0D5C63] mb-2">❙ 小提醒</h4>
                            <ul className="list-disc pl-4 space-y-1">
                                <li>靈氣體驗需配合回饋心得，溫妮結束約3天後會詢問寶貝的狀況（即使沒有明顯肉眼觀察到不一樣的地方，也需要回覆喔！）</li>
                                <li>若無回覆訊息將取消往後任何優惠以及體驗資格</li>
                                <li>參與此活動視同同意將回饋心得分享至社群(會遮蔽個人資訊/照片)</li>
                            </ul>
                        </div>
                  </div>
              </div>
            </div>
          )}

           {msgModalOpen && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-[#5D5550]/20 backdrop-blur-sm animate-in fade-in">
              <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                  <div className="p-4 border-b border-[#F0EAE6] flex justify-between items-center bg-[#FBF9F8]">
                      <h3 className="font-bold text-[#5D5550]">匯款資訊生成</h3>
                      <button onClick={() => setMsgModalOpen(false)}><X className="w-5 h-5 text-[#A8A09B]"/></button>
                  </div>
                  <div className="p-4 flex-1 overflow-auto">
                      <textarea className="w-full h-64 border border-[#F0EAE6] rounded-xl p-4 text-sm focus:border-[#FA8C76] outline-none font-mono leading-relaxed bg-[#FFFBF9]" value={msgContent} onChange={(e) => setMsgContent(e.target.value)}></textarea>
                  </div>
                  <div className="p-4 bg-white border-t border-[#F0EAE6]">
                      <button onClick={() => copyToClipboard(msgContent)} className="w-full bg-[#FA8C76] text-white py-3 rounded-xl font-bold shadow-lg shadow-[#FA8C76]/20 flex items-center justify-center gap-2 hover:bg-[#F27A63] transition"><Copy className="w-4 h-4"/> 複製內容</button>
                  </div>
              </div>
            </div>
          )}

           {/* Delete Confirmation Modal */}
           {deleteConfirmModalOpen && (
             <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[#5D5550]/20 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden p-6 space-y-4 text-center">
                    <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto text-red-500 mb-2">
                        <AlertTriangle className="w-8 h-8" />
                    </div>
                    <h3 className="font-bold text-[#5D5550] text-xl">確定要刪除嗎？</h3>
                    <p className="text-[#8D8580] text-sm leading-relaxed">
                        {deleteTarget?.type === 'app' ? (
                            <>此動作會將預約移至垃圾桶<br/>您可以在垃圾桶中檢視紀錄</>
                        ) : (
                            <>此動作將永久刪除此時段<br/>若有相關預約請先處理</>
                        )}
                    </p>
                    <div className="flex gap-2 pt-2">
                        <button onClick={() => setDeleteConfirmModalOpen(false)} className="flex-1 py-3 rounded-xl bg-[#F0EAE6] text-[#8D8580] font-bold hover:bg-gray-200 transition">取消</button>
                        <button onClick={confirmDelete} className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold shadow-lg shadow-red-200 hover:bg-red-600 transition">確認刪除</button>
                    </div>
                </div>
             </div>
           )}

    </>
  );
}
