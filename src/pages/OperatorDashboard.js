// -------------- IMPORTS --------------
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  Timestamp
} from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
  LogOut,
  Bus,
  AlertTriangle,
  CheckCircle2,
  FileText
} from 'lucide-react';

// -------------- COMPONENTE PRINCIPAL --------------
export default function OperatorDashboard() {
  const { userProfile, logout, currentUser } = useAuth();

  // ------------------ ESTADOS ------------------
  const [isLoading, setIsLoading] = useState(true);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isOperationDialogOpen, setIsOperationDialogOpen] = useState(false);

  const [operationDate, setOperationDate] = useState(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('operationDate') || '';
  });

  const [vehicles, setVehicles] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [records, setRecords] = useState([]);
  const [filteredRecords, setFilteredRecords] = useState([]);

  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const [formData, setFormData] = useState({
    vehicleId: '',
    physicalReading: '',
    electronicReading: '',
    journeyClosed: true, // começa como jornada fechada
    physicalUnreadable: false,
    validatorBroken: false,
    observation: ''
  });

  // Eletrônica igual à Física ATIVADO por padrão
  const [sameAsPhysical, setSameAsPhysical] = useState(true);

  const [editingRecord, setEditingRecord] = useState(null);

  const [filters, setFilters] = useState({
    search: '',
    status: 'pending',        // pending | done | all
    discrepancy: false,
    journeyOpen: false,
    validatorBroken: false
  });

  const [isOffline, setIsOffline] = useState(false);

  // PAGINAÇÃO REAL
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalFiltered, setTotalFiltered] = useState(0);

  const OFFLINE_QUEUE_KEY = 'turnstile_offline_queue';

  const hasMismatch = (physical, electronic) =>
    physical != null &&
    electronic != null &&
    physical !== electronic;

  // ------------------ OFFLINE MODE ------------------
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      toast.success('Conexão restabelecida. Sincronizando registros offline...');
      syncOfflineQueue();
    };

    const handleOffline = () => {
      setIsOffline(true);
      toast.warning('Você está offline. Registros serão salvos localmente.');
    };

    if (typeof window !== 'undefined') {
      setIsOffline(!navigator.onLine);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, []);

  const loadOfflineQueue = () => {
    try {
      const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch {
      return [];
    }
  };

  const saveOfflineQueue = (queue) => {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  };

  const enqueueOfflineRecord = (payload) => {
    const queue = loadOfflineQueue();
    queue.push({
      ...payload,
      _localId: `${Date.now()}-${Math.random()}`
    });
    saveOfflineQueue(queue);
  };

  const syncOfflineQueue = useCallback(async () => {
    const queue = loadOfflineQueue();
    if (!queue.length) return;

    try {
      for (const item of queue) {
        const { _localId, ...data } = item;
        await addDoc(collection(db, 'turnstile_records'), data);

        await addDoc(collection(db, 'turnstile_records_logs'), {
          action: 'create_offline_sync',
          recordVehicleId: data.vehicleId,
          operatorId: data.operatorId,
          operatorName: data.operatorName,
          createdAt: new Date(),
          payload: data
        });
      }

      saveOfflineQueue([]);
      toast.success('Registros offline sincronizados!');
      loadRecords();
    } catch (err) {
      toast.error('Erro ao sincronizar registros offline.');
    }
  }, []);

  // ------------------ CARREGAMENTO ------------------
  useEffect(() => {
    loadVehicles();
    loadCompanies();
  }, [currentUser]);

  useEffect(() => {
    if (!operationDate) {
      setIsOperationDialogOpen(true);
      setRecords([]);
      setFilteredRecords([]);
      setProgress({ done: 0, total: vehicles.length || 0 });
      return;
    }
    loadRecords();
  }, [operationDate, currentUser, vehicles]);

  const loadVehicles = async () => {
    try {
      const q = query(collection(db, 'vehicles'), where('isActive', '==', true));
      const snap = await getDocs(q);
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setVehicles(data);
      setProgress((prev) => ({ ...prev, total: data.length }));
    } catch (err) {
      toast.error('Erro ao carregar veículos');
    }
  };

  const loadCompanies = async () => {
    try {
      const q = query(collection(db, 'companies'), where('isActive', '==', true));
      const snap = await getDocs(q);
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setCompanies(data);
    } catch (err) {
      toast.error('Erro ao carregar empresas');
    }
  };

  const loadRecords = async () => {
    try {
      setIsLoading(true);

      if (!operationDate) {
        setIsLoading(false); // <-- ESSENCIAL
        return;
      }

      const [day, month, year] = operationDate.split('/');
      const startOfDay = new Date(`${year}-${month}-${day}T00:00:00`);
      const endOfDay = new Date(`${year}-${month}-${day}T23:59:59`);

      const q = query(
        collection(db, 'turnstile_records'),
        where('operationDate', '>=', startOfDay),
        where('operationDate', '<=', endOfDay)
      );

      const snap = await getDocs(q);
      const list = [];

      for (const docSnap of snap.docs) {
        const data = docSnap.data();

        const vehicleDoc = await getDoc(doc(db, 'vehicles', data.vehicleId));
        const vehicleData = vehicleDoc.exists() ? vehicleDoc.data() : {};

        const companyDoc = vehicleData.companyId
          ? await getDoc(doc(db, 'companies', vehicleData.companyId))
          : null;
        const companyData = companyDoc?.exists() ? companyDoc.data() : {};

        list.push({
          id: docSnap.id,
          ...data,
          vehiclePlate: vehicleData.plate || '',
          vehicleNumber: vehicleData.number || '',
          companyId: vehicleData.companyId || '',
          companyName: companyData.name || '',
          createdAtDate: data.createdAt?.toDate?.() || null,
          type: 'done'
        });
      }

      setRecords(list);
      setProgress((prev) => ({ ...prev, done: list.length }));
      setIsLoading(false);

    } catch (err) {
      toast.error('Erro ao carregar registros');
      setIsLoading(false);
    }
  };


  // ------------------ FILTROS + PAGINAÇÃO ------------------
  useEffect(() => {
    applyFilters();
  }, [filters, records, vehicles, companies, page, pageSize]);

  const applyFilters = () => {
    const doneList = records.map((r) => ({ ...r, type: 'done' }));

    const doneIds = new Set(records.map((r) => r.vehicleId));

    const pendingList = vehicles
      .filter((v) => !doneIds.has(v.id))
      .map((v) => {
        const company = companies.find((c) => c.id === v.companyId);
        return {
          id: v.id,
          vehicleId: v.id,
          vehicleNumber: v.number || '',
          vehiclePlate: v.plate || '',
          companyId: v.companyId || '',
          companyName: company?.name || '',
          createdAtDate: null,
          physicalReading: null,
          electronicReading: null,
          journeyClosed: true,
          operatorName: '',
          physicalUnreadable: false,
          validatorBroken: false,
          observation: '',
          type: 'pending'
        };
      });

    let list = [...doneList, ...pendingList];

    if (filters.search.trim() !== '') {
      const s = filters.search.toLowerCase();
      list = list.filter((r) =>
        (r.vehiclePlate || '').toLowerCase().includes(s) ||
        (r.vehicleNumber || '').toLowerCase().includes(s)
      );
    }

    if (filters.status === 'pending') {
      list = list.filter((r) => r.type === 'pending');
    } else if (filters.status === 'done') {
      list = list.filter((r) => r.type === 'done');
    }

    if (filters.discrepancy) {
      list = list.filter(
        (r) =>
          r.type === 'done' &&
          hasMismatch(r.physicalReading, r.electronicReading)
      );
    }

    if (filters.journeyOpen) {
      list = list.filter(
        (r) => r.type === 'done' && !r.journeyClosed
      );
    }

    if (filters.validatorBroken) {
      list = list.filter(
        (r) => r.type === 'done' && r.validatorBroken
      );
    }

    list.sort((a, b) =>
      (a.vehicleNumber || '').localeCompare(b.vehicleNumber || '')
    );

    setTotalFiltered(list.length);

    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginated = list.slice(start, end);

    setFilteredRecords(paginated);
  };

  const setStatusFilter = (status) => {
    setFilters((prev) => ({
      ...prev,
      status
    }));
    setPage(1);
  };

  const toggleSpecialFilter = (field) => {
    setFilters((prev) => {
      const nextValue = !prev[field];
      const next = {
        ...prev,
        [field]: nextValue
      };

      // Se ativar Discrepâncias / Jornada Aberta / Defeitos → força status = done
      if (nextValue && prev.status !== 'done') {
        next.status = 'done';
      }

      return next;
    });
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      status: 'all',
      discrepancy: false,
      journeyOpen: false,
      validatorBroken: false
    });
    setPage(1);
  };

  // ------------------ EXPORT CSV ------------------
  const exportCsv = () => {
    if (!operationDate) {
      toast.error('Defina o dia da operação para exportar.');
      return;
    }

    const headers = [
      'Veículo',
      'Placa',
      'Empresa',
      'Física',
      'Eletrônica',
      'Ilegível',
      'Validador Defeituoso',
      'Observação',
      'JornadaFechada',
      'Operador',
      'CriadoEm',
      'DataOperação'
    ];

    const rows = records.map((r) => {
      const createdAt =
        r.createdAtDate
          ? (r.createdAtDate.toDate ? r.createdAtDate.toDate() : r.createdAtDate)
            .toLocaleString('pt-BR')
          : '';

      const operation =
        r.operationDate
          ? (r.operationDate.toDate ? r.operationDate.toDate() : r.operationDate)
            .toLocaleDateString('pt-BR')
          : '';

      return [
        r.vehicleNumber || '',
        r.vehiclePlate || '',
        r.companyName || '',
        r.physicalReading ?? '',
        r.electronicReading ?? '',
        r.physicalUnreadable ? 'Sim' : 'Não',
        r.validatorBroken ? 'Sim' : 'Não',
        r.observation || '',
        r.journeyClosed ? 'Sim' : 'Não',
        r.operatorName || '',
        createdAt,
        operation
      ];
    });

    const csvContent =
      [headers, ...rows]
        .map((row) =>
          row
            .map((field) => `"${String(field).replace(/"/g, '""')}"`)
            .join(';')
        )
        .join('\n');

    const blob = new Blob(['\ufeff', csvContent], {
      type: 'text/csv;charset=utf-8;'
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.setAttribute(
      'download',
      `registros_${operationDate.replace(/\//g, '-')}.csv`
    );

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  // ------------------ MODAIS ------------------
  const openRegisterModalForVehicle = (item) => {
    setEditingRecord(null);
    setSameAsPhysical(true); // padrão: eletrônica igual à física
    setFormData({
      vehicleId: item.vehicleId,
      physicalReading: '',
      electronicReading: '',
      journeyClosed: true, // começa fechada
      physicalUnreadable: false,
      validatorBroken: false,
      observation: ''
    });
    setIsDialogOpen(true);
  };

  const openEditModalForRecord = (record) => {
    setEditingRecord(record);
    setSameAsPhysical(
      record.physicalReading != null &&
      record.electronicReading != null &&
      record.physicalReading === record.electronicReading
    );
    setFormData({
      vehicleId: record.vehicleId,
      physicalReading: record.physicalReading ?? '',
      electronicReading: record.electronicReading ?? '',
      journeyClosed: record.journeyClosed ?? true,
      physicalUnreadable: Boolean(record.physicalUnreadable),
      validatorBroken: Boolean(record.validatorBroken),
      observation: record.observation || ''
    });
    setIsDialogOpen(true);
  };

  // ------------------ SALVAR REGISTRO ------------------
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!operationDate) {
      toast.error('Defina o dia da operação antes de registrar.');
      setIsOperationDialogOpen(true);
      return;
    }

    if (!formData.vehicleId) {
      toast.error('Veículo inválido.');
      return;
    }

    if (!formData.physicalUnreadable && !formData.physicalReading) {
      toast.error('Informe a Leitura Física ou marque "Ilegível".');
      return;
    }

    if (!formData.validatorBroken && !formData.electronicReading) {
      toast.error('Informe a Leitura Eletrônica ou marque "Validador com defeito".');
      return;
    }

    try {
      if (editingRecord) {
        await updateDoc(doc(db, 'turnstile_records', editingRecord.id), {
          physicalReading: formData.physicalUnreadable ? null : parseInt(formData.physicalReading),
          electronicReading: formData.validatorBroken ? null : parseInt(formData.electronicReading),
          physicalUnreadable: formData.physicalUnreadable,
          validatorBroken: formData.validatorBroken,
          observation: formData.observation || '',
          journeyClosed: formData.journeyClosed,
          updatedAt: new Date()
        });

        toast.success('Registro atualizado!');
      } else {
        const selectedVehicle = vehicles.find(
          (v) => v.id === formData.vehicleId
        );

        const [day, month, year] = operationDate.split('/');
        const opDate = new Date(`${year}-${month}-${day}T00:00:00`);

        const payload = {
          vehicleId: formData.vehicleId,
          vehicleNumber: selectedVehicle?.number || '',
          physicalReading: formData.physicalUnreadable ? null : parseInt(formData.physicalReading),
          electronicReading: formData.validatorBroken ? null : parseInt(formData.electronicReading),
          physicalUnreadable: formData.physicalUnreadable,
          validatorBroken: formData.validatorBroken,
          observation: formData.observation || '',
          journeyClosed: formData.journeyClosed,
          operatorId: currentUser.uid,
          operatorName: userProfile?.name || currentUser?.email,
          createdAt: new Date(),
          operationDate: Timestamp.fromDate(opDate)
        };

        if (isOffline) {
          enqueueOfflineRecord(payload);
          toast.success('Registro salvo offline!');
        } else {
          await addDoc(collection(db, 'turnstile_records'), payload);
          toast.success('Registro adicionado!');
        }
      }

      setFormData({
        vehicleId: '',
        physicalReading: '',
        electronicReading: '',
        journeyClosed: true,
        physicalUnreadable: false,
        validatorBroken: false,
        observation: ''
      });
      setSameAsPhysical(true);
      setEditingRecord(null);
      setIsDialogOpen(false);
      loadRecords();
    } catch (error) {
      toast.error('Erro ao salvar registro');
    }
  };

  // ------------------ EXIBE TEXTO DO VEÍCULO NO MODAL ------------------
  const getVehicleDisplay = () => {
    if (editingRecord) {
      return `${editingRecord.vehicleNumber} - ${editingRecord.vehiclePlate}`;
    }

    const v = vehicles.find((x) => x.id === formData.vehicleId);
    if (!v) return '';

    return `${v.number || ''} - ${v.plate || ''}`;
  };

  // ------------------ RENDER ------------------
  return (
    <div className="min-h-screen bg-slate-950">
      {/* HEADER */}
      <header className="border-b border-slate-800 bg-slate-900/50">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-white">RoletaFlow</h1>
            <p className="text-sm text-slate-400">
              {userProfile?.name || currentUser?.email}
            </p>

            {isOffline && (
              <p className="text-xs text-amber-400 mt-1">
                Modo offline — registros serão sincronizados depois.
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-slate-400">Dia da Operação</p>
              <p className="text-sm text-white font-semibold">
                {operationDate || 'Não definido'}
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
              onClick={() => setIsOperationDialogOpen(true)}
            >
              Alterar Dia
            </Button>

            <Button
              onClick={logout}
              variant="ghost"
              className="text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="container mx-auto px-4 py-8 space-y-6">

        {/* PROGRESSO */}
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl">
          <h3 className="text-xl font-semibold text-white mb-3">Progresso do Dia</h3>

          <p className="text-3xl font-bold text-amber-500">
            {progress.done} / {progress.total}
          </p>

          <p className="text-sm text-slate-400 mt-1">
            veículos analisados na data {operationDate || '—'}
          </p>

          <div className="w-full h-3 bg-slate-800 rounded mt-4 overflow-hidden">
            <div
              className="h-full bg-amber-500 transition-all"
              style={{
                width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`
              }}
            />
          </div>
        </div>

        {/* FILTROS */}
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl">
          <h3 className="text-xl font-semibold text-white mb-4">Filtros</h3>

          <div className="mb-4">
            <Label className="text-slate-300 text-xs">Buscar veículo</Label>
            <Input
              placeholder="Buscar por número ou placa"
              value={filters.search}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, search: e.target.value }))
              }
              className="bg-slate-950 border-slate-800 text-white mt-1"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            {/* VER TODOS */}
            <Button
              variant={filters.status === 'all' ? 'default' : 'outline'}
              className={
                filters.status === 'all'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'border-slate-700 text-slate-300 hover:bg-slate-800'
              }
              onClick={() => setStatusFilter('all')}
            >
              Ver todos
            </Button>

            {/* PENDENTES */}
            <Button
              variant={filters.status === 'pending' ? 'default' : 'outline'}
              className={
                filters.status === 'pending'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'border-slate-700 text-slate-300 hover:bg-slate-800'
              }
              onClick={() => {
                setFilters((prev) => ({
                  ...prev,
                  status: 'pending',
                  discrepancy: false,
                  journeyOpen: false,
                  validatorBroken: false
                }));
                setPage(1);
              }}
            >
              Pendentes
            </Button>

            {/* CONCLUÍDOS */}
            <Button
              variant={filters.status === 'done' ? 'default' : 'outline'}
              className={
                filters.status === 'done'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'border-slate-700 text-slate-300 hover:bg-slate-800'
              }
              onClick={() => setStatusFilter('done')}
            >
              Concluídos
            </Button>

            {/* DISCREPÂNCIA */}
            <Button
              variant={filters.discrepancy ? 'default' : 'outline'}
              className={
                filters.discrepancy
                  ? 'bg-rose-600 text-white font-semibold'
                  : 'border-slate-700 text-slate-300 hover:bg-slate-800'
              }
              onClick={() => toggleSpecialFilter('discrepancy')}
            >
              Discrepâncias
            </Button>

            {/* JORNADA ABERTA */}
            <Button
              variant={filters.journeyOpen ? 'default' : 'outline'}
              className={
                filters.journeyOpen
                  ? 'bg-amber-600 text-white font-semibold'
                  : 'border-slate-700 text-slate-300 hover:bg-slate-800'
              }
              onClick={() => toggleSpecialFilter('journeyOpen')}
            >
              Jornada Aberta
            </Button>

            {/* VALIDADOR COM DEFEITO */}
            <Button
              variant={filters.validatorBroken ? 'default' : 'outline'}
              className={
                filters.validatorBroken
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'border-slate-700 text-slate-300 hover:bg-slate-800'
              }
              onClick={() => toggleSpecialFilter('validatorBroken')}
            >
              Defeitos
            </Button>

            {/* LIMPAR */}
            <Button
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
              variant="outline"
              onClick={clearFilters}
            >
              Limpar Filtros
            </Button>

            {/* EXPORT CSV */}
            <Button
              variant="outline"
              className="border-amber-500 text-amber-400 hover:bg-amber-500/10 text-xs"
              onClick={exportCsv}
            >
              Exportar CSV
            </Button>
          </div>
        </div>

        {/* LISTA PAGINADA */}
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl">
          <h3 className="text-xl font-semibold text-white mb-4">
            Veículos e Registros
          </h3>

          <div className="space-y-3">
            {filteredRecords.map((item) => (
              <Row
                key={item.id}
                item={item}
                openEditModalForRecord={openEditModalForRecord}
                openRegisterModalForVehicle={openRegisterModalForVehicle}
                operationDate={operationDate}
              />
            ))}
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-slate-400">
              Carregando...
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              Nenhum veículo encontrado com os filtros atuais.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRecords.map((item) => (
                <Row
                  key={item.id}
                  item={item}
                  openEditModalForRecord={openEditModalForRecord}
                  openRegisterModalForVehicle={openRegisterModalForVehicle}
                  operationDate={operationDate}
                />
              ))}
            </div>
          )}


          <div className="flex justify-between items-center mt-6">
            <Button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="bg-slate-800 hover:bg-slate-700 text-white"
            >
              Anterior
            </Button>

            <span className="text-slate-400 text-sm">
              Página {page} de {Math.ceil(totalFiltered / pageSize) || 1}
            </span>

            <Button
              disabled={page >= Math.ceil(totalFiltered / pageSize)}
              onClick={() => setPage((p) => p + 1)}
              className="bg-slate-800 hover:bg-slate-700 text-white"
            >
              Próxima
            </Button>
          </div>
        </div>
      </main>

      {/* MODAL DE SELECIONA DATA */}
      <Dialog open={isOperationDialogOpen} onOpenChange={setIsOperationDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              Iniciar Dia da Operação
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <Label>Dia da Operação</Label>
            <Input
              type="date"
              className="bg-slate-950 border-slate-800 text-white"
              onChange={(e) => {
                const raw = e.target.value;
                if (!raw) return;
                const [y, m, d] = raw.split('-');
                const formatted = `${d}/${m}/${y}`;
                setOperationDate(formatted);
                localStorage.setItem('operationDate', formatted);
              }}
            />

            <Button
              className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold"
              onClick={() => {
                if (!operationDate) {
                  toast.error('Selecione uma data válida.');
                  return;
                }
                setIsOperationDialogOpen(false);
              }}
            >
              Confirmar Dia
            </Button>

            {operationDate && (
              <Button
                variant="ghost"
                className="text-slate-400 hover:text-white hover:bg-slate-800 mt-2"
                onClick={() => {
                  setOperationDate('');
                  localStorage.removeItem('operationDate');
                  setIsOperationDialogOpen(true);
                }}
              >
                Limpar dia atual ({operationDate})
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL DE REGISTRO */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {editingRecord ? 'Editar Registro' : 'Registrar Veículo'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* VEÍCULO */}
            <div>
              <Label className="text-slate-300">Veículo</Label>
              <Input
                disabled
                value={getVehicleDisplay()}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>

            {/* LEITURA FÍSICA */}
            <div>
              <Label className="text-slate-300">Leitura Física</Label>

              {!formData.physicalUnreadable && (
                <Input
                  type="number"
                  required={!formData.physicalUnreadable}
                  value={formData.physicalReading}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormData((prev) => ({
                      ...prev,
                      physicalReading: value,
                      electronicReading: sameAsPhysical
                        ? value
                        : prev.electronicReading
                    }));
                  }}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              )}

              <div className="flex items-center gap-2 mt-2">
                <Checkbox
                  checked={formData.physicalUnreadable}
                  onCheckedChange={(v) =>
                    setFormData((prev) => ({
                      ...prev,
                      physicalUnreadable: Boolean(v),
                      physicalReading: v ? '' : prev.physicalReading
                    }))
                  }
                />
                <Label className="text-slate-300">Leitura Física ilegível</Label>
              </div>
            </div>

            {/* LEITURA ELETRÔNICA */}
            <div>
              <Label className="text-slate-300">Leitura Eletrônica</Label>

              <Input
                type="number"
                required={!formData.validatorBroken} // se marcado, vira opcional
                disabled={sameAsPhysical}
                value={formData.electronicReading}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    electronicReading: e.target.value
                  }))
                }
                className={`bg-slate-800 border-slate-700 text-white ${sameAsPhysical ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
              />

              <div className="flex items-center gap-2 mt-2">
                <Checkbox
                  checked={sameAsPhysical}
                  onCheckedChange={(checked) => {
                    setSameAsPhysical(checked);
                    setFormData((prev) => ({
                      ...prev,
                      electronicReading: checked
                        ? prev.physicalReading
                        : prev.electronicReading
                    }));
                  }}
                />
                <Label className="text-slate-300">
                  Eletrônica igual à Física
                </Label>
              </div>

              <div className="flex items-center gap-2 mt-2">
                <Checkbox
                  checked={formData.validatorBroken}
                  onCheckedChange={(v) =>
                    setFormData((prev) => ({
                      ...prev,
                      validatorBroken: Boolean(v),
                      electronicReading: v ? '' : prev.electronicReading
                    }))
                  }
                />
                <Label className="text-slate-300">Validador com defeito</Label>
              </div>
            </div>

            {/* OBSERVAÇÃO */}
            <div>
              <Label className="text-slate-300">Observação</Label>
              <Input
                type="text"
                placeholder="Opcional"
                value={formData.observation}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    observation: e.target.value
                  }))
                }
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>

            {/* JORNADA */}
            <div className="flex items-center gap-2">
              <Checkbox
                checked={!formData.journeyClosed}
                onCheckedChange={(v) =>
                  setFormData((prev) => ({
                    ...prev,
                    journeyClosed: !Boolean(v) // marcado = aberta (false)
                  }))
                }
              />
              <Label className="text-slate-300">Jornada Aberta</Label>
            </div>

            {/* BOTÃO SALVAR */}
            <Button
              type="submit"
              className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold"
            >
              {editingRecord ? 'Salvar Alterações' : 'Registrar'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ------------------ COMPONENTE ROW ------------------
const Row = React.memo(
  ({ item, openEditModalForRecord, openRegisterModalForVehicle, operationDate }) => {
    const mismatch =
      item.type === 'done' &&
      item.physicalReading != null &&
      item.electronicReading != null &&
      item.physicalReading !== item.electronicReading;

    return (
      <div
        className={`p-4 rounded-lg border ${item.type === 'done'
          ? mismatch
            ? 'border-rose-500 bg-slate-900'
            : 'border-slate-800 bg-slate-900'
          : 'border-amber-500 bg-slate-900'
          }`}
      >
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              {item.type === 'done' ? (
                mismatch ? (
                  <AlertTriangle className="h-5 w-5 text-rose-500" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                )
              ) : (
                <Bus className="h-5 w-5 text-amber-500" />
              )}

              <span className="text-lg font-mono font-bold text-white">
                {item.vehicleNumber}
              </span>

              <span className="text-sm text-slate-400 font-mono">
                {item.vehiclePlate}
              </span>

              <span className="text-sm text-slate-400 ml-2">
                {item.companyName}
              </span>

              <span className="text-xs px-2 py-0.5 rounded-full border border-slate-700 text-slate-300 ml-2">
                {item.type === 'done' ? 'Concluído' : 'Pendente'}
              </span>
            </div>

            {item.type === 'done' ? (
              <>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-slate-400">Física:</span>
                    <span
                      className={`ml-2 font-mono font-bold ${item.physicalUnreadable
                        ? 'text-amber-400'
                        : mismatch
                          ? 'text-rose-500'
                          : 'text-white'
                        }`}
                    >
                      {item.physicalUnreadable ? 'Ilegível' : item.physicalReading}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400">Eletrônica:</span>
                    <span
                      className={`ml-2 font-mono font-bold ${item.validatorBroken
                        ? 'text-amber-400'
                        : mismatch
                          ? 'text-rose-500'
                          : 'text-white'
                        }`}
                    >
                      {item.validatorBroken
                        ? 'Validador com defeito'
                        : item.electronicReading}
                    </span>
                  </div>
                </div>

                <div className="mt-2 text-xs text-slate-500 flex flex-col gap-1">
                  <span>
                    {!item.journeyClosed ? '⚠ Jornada Aberta' : '✓ Jornada Fechada'}
                  </span>

                  <span>
                    Operador:{' '}
                    <span className="text-slate-300">
                      {item.operatorName || '—'}
                    </span>
                  </span>

                  {item.observation && (
                    <span className="flex items-center gap-1 text-amber-300 mt-1">
                      <FileText className="h-3 w-3" />
                      Observação: {item.observation}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="mt-1 text-sm text-slate-400">
                Nenhuma leitura registrada para este veículo na data{' '}
                {operationDate || '—'}.
              </div>
            )}
          </div>

          <div className="flex flex-col items-end gap-2 w-full sm:w-auto">
            {item.type === 'done' && (
              <div className="text-xs text-slate-500 text-right">
                {item.createdAtDate
                  ? item.createdAtDate.toLocaleString('pt-BR')
                  : 'N/A'}
              </div>
            )}

            <Button
              size="sm"
              className={`w-full sm:w-auto ${item.type === 'done'
                ? 'bg-slate-800 hover:bg-slate-700 text-white'
                : 'bg-amber-500 hover:bg-amber-600 text-slate-950'
                }`}
              onClick={() =>
                item.type === 'done'
                  ? openEditModalForRecord(item)
                  : openRegisterModalForVehicle(item)
              }
            >
              {item.type === 'done' ? 'Editar' : 'Registrar'}
            </Button>
          </div>
        </div>
      </div>
    );
  }
);
