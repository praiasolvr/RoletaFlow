import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, getDocs, doc, getDoc, Timestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Search, Download, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function Reports() {
  const { userProfile, currentUser } = useAuth();
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [filteredRecords, setFilteredRecords] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const isAdmin = userProfile?.role === 'admin';

  useEffect(() => {
    loadRecords();
  }, [currentUser, userProfile]);

  useEffect(() => {
    filterRecords();
  }, [searchTerm, dateFilter, records]);

  const loadRecords = async () => {
    try {
      let recordsQuery;

      if (isAdmin) {
        recordsQuery = query(
          collection(db, 'turnstile_records'),
          orderBy('createdAt', 'desc')
        );
      } else {
        recordsQuery = query(
          collection(db, 'turnstile_records'),
          where('operatorId', '==', currentUser.uid),
          orderBy('createdAt', 'desc')
        );
      }

      const snapshot = await getDocs(recordsQuery);
      const recordsData = [];

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();

        const vehicleDoc = await getDoc(doc(db, 'vehicles', data.vehicleId));
        const vehicleData = vehicleDoc.exists() ? vehicleDoc.data() : {};

        recordsData.push({
          id: docSnap.id,
          ...data,
          vehicleNumber: vehicleData.number || 'N/A',
          vehiclePlate: vehicleData.plate || 'N/A',
          vehicleType: vehicleData.type || 'N/A'
        });
      }

      setRecords(recordsData);
      setFilteredRecords(recordsData);
    } catch (error) {
      console.error('Error loading records:', error);
      toast.error('Erro ao carregar registros');
    }
  };

  const filterRecords = () => {
    let filtered = [...records];

    if (searchTerm) {
      filtered = filtered.filter(record =>
        record.vehicleNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.vehiclePlate.toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.operatorName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // 🔥 FILTRO CORRIGIDO — INTERVALO DO DIA
    if (dateFilter) {
      const [year, month, day] = dateFilter.split('-');

      const start = Timestamp.fromDate(new Date(`${year}-${month}-${day}T00:00:00`));
      const end = Timestamp.fromDate(new Date(`${year}-${month}-${day}T23:59:59`));

      filtered = filtered.filter(record => {
        const op = record.operationDate?.toDate?.();
        return op && op >= start.toDate() && op <= end.toDate();
      });
    }

    setFilteredRecords(filtered);
  };

  const exportToCSV = () => {
    const headers = [
      'Data da Operação',
      'Lançado em',
      'Veículo',
      'Placa',
      'Roleta Física',
      'Roleta Eletrônica',
      'Jornada',
      'Operador'
    ];

    const rows = filteredRecords.map(record => [
      record.operationDate?.toDate?.()?.toLocaleDateString('pt-BR') || 'N/A',
      record.createdAt?.toDate?.()?.toLocaleString('pt-BR') || 'N/A',
      record.vehicleNumber || '',
      record.vehiclePlate || '',
      record.physicalReading || '',
      record.electronicReading || '',
      record.journeyClosed ? 'Fechada' : 'Aberta',
      record.operatorName || ''
    ]);

    const csvContent = [
      headers.join(';'),
      ...rows.map(row =>
        row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(';')
      )
    ].join('\n');

    // 🔥 BOM para corrigir acentuação no Excel
    const BOM = '\uFEFF';

    const blob = new Blob([BOM + csvContent], {
      type: 'text/csv;charset=utf-8;'
    });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio_roletas_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();

    toast.success('Relatório exportado com sucesso!');
  };

  const stats = {
    total: filteredRecords.length,
    mismatches: filteredRecords.filter(r => r.physicalReading !== r.electronicReading).length,
    journeyClosed: filteredRecords.filter(r => r.journeyClosed).length,
    journeyOpen: filteredRecords.filter(r => !r.journeyClosed).length
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              data-testid="back-button"
              onClick={() => navigate(isAdmin ? '/admin/dashboard' : '/operator/dashboard')}
              variant="ghost"
              className="text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-white">Relatórios</h1>
              <p className="text-sm text-slate-400">
                {isAdmin ? 'Todos os registros' : 'Meus registros'}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">

        {/* CARDS DE ESTATÍSTICAS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="p-4 bg-slate-900/50 border-slate-800/50">
            <div className="text-sm text-slate-400 mb-1">Total Registros</div>
            <div className="text-2xl font-bold text-white">{stats.total}</div>
          </Card>

          <Card className="p-4 bg-rose-900/20 border-rose-500/30">
            <div className="text-sm text-rose-400 mb-1">Discrepâncias</div>
            <div className="text-2xl font-bold text-rose-500">{stats.mismatches}</div>
          </Card>

          <Card className="p-4 bg-emerald-900/20 border-emerald-500/30">
            <div className="text-sm text-emerald-400 mb-1">Jornada Fechada</div>
            <div className="text-2xl font-bold text-emerald-500">{stats.journeyClosed}</div>
          </Card>

          <Card className="p-4 bg-amber-900/20 border-amber-500/30">
            <div className="text-sm text-amber-400 mb-1">Jornada Aberta</div>
            <div className="text-2xl font-bold text-amber-500">{stats.journeyOpen}</div>
          </Card>
        </div>

        {/* FILTROS */}
        <Card className="p-6 bg-slate-900/50 border-slate-800/50 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* BUSCA */}
            <div className="space-y-2">
              <Label className="text-slate-200">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Veículo, placa ou operador..."
                  className="pl-10 bg-slate-950 border-slate-800 h-12 text-white"
                />
              </div>
            </div>

            {/* FILTRO POR DATA DA OPERAÇÃO */}
            <div className="space-y-2">
              <Label className="text-slate-200">Data da Operação</Label>
              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="bg-slate-950 border-slate-800 h-12 text-white"
              />
            </div>

            {/* BOTÕES */}
            <div className="space-y-2">
              <Label className="text-slate-200">&nbsp;</Label>
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setSearchTerm('');
                    setDateFilter('');
                  }}
                  variant="outline"
                  className="flex-1 h-12 border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  Limpar Filtros
                </Button>

                <Button
                  onClick={exportToCSV}
                  className="flex-1 h-12 bg-amber-500 hover:bg-amber-600 text-slate-950"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Exportar
                </Button>
              </div>
            </div>
          </div>
        </Card>
        {/* LISTAGEM */}
        <div className="space-y-3">
          {filteredRecords.map((record) => {
            const mismatch = record.physicalReading !== record.electronicReading;

            return (
              <Card
                key={record.id}
                className={`p-4 bg-slate-900/50 ${mismatch ? 'border-rose-500/50 bg-rose-500/5' : 'border-slate-800/50'
                  }`}
              >
                <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-center">

                  {/* VEÍCULO */}
                  <div className="flex items-center gap-2">
                    {mismatch ? (
                      <AlertTriangle className="h-5 w-5 text-rose-500" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    )}
                    <div>
                      <div className="text-lg font-mono font-bold text-white">{record.vehicleNumber}</div>
                      <div className="text-sm text-slate-400 font-mono">{record.vehiclePlate}</div>
                    </div>
                  </div>

                  {/* FÍSICA */}
                  <div>
                    <div className="text-xs text-slate-500">Física</div>
                    <div className={`text-xl font-mono font-bold ${mismatch ? 'text-rose-500' : 'text-white'}`}>
                      {record.physicalReading}
                    </div>
                  </div>

                  {/* ELETRÔNICA */}
                  <div>
                    <div className="text-xs text-slate-500">Eletrônica</div>
                    <div className={`text-xl font-mono font-bold ${mismatch ? 'text-rose-500' : 'text-white'}`}>
                      {record.electronicReading}
                    </div>
                  </div>

                  {/* JORNADA */}
                  <div>
                    <div className="text-xs text-slate-500">Jornada</div>
                    <div className="text-sm text-white">
                      {record.journeyClosed ? (
                        <span className="text-emerald-500">✓ Fechada</span>
                      ) : (
                        <span className="text-amber-500">⚠ Aberta</span>
                      )}
                    </div>
                  </div>

                  {/* OPERADOR */}
                  {isAdmin && (
                    <div>
                      <div className="text-xs text-slate-500">Operador</div>
                      <div className="text-sm text-white">{record.operatorName}</div>
                    </div>
                  )}

                  {/* DATAS */}
                  <div className="text-right">
                    <div className="text-xs text-slate-500">Data da Operação</div>
                    <div className="text-sm text-white">
                      {/* 🔥 AGORA SEM HORA */}
                      {record.operationDate?.toDate?.()?.toLocaleDateString('pt-BR') || 'N/A'}
                    </div>

                    <div className="text-xs text-slate-500 mt-2">Lançado em</div>
                    <div className="text-sm text-white">
                      {record.createdAt?.toDate?.()?.toLocaleString('pt-BR') || 'N/A'}
                    </div>
                  </div>

                </div>
              </Card>
            );
          })}

          {filteredRecords.length === 0 && (
            <Card className="p-8 bg-slate-900/50 border-slate-800/50 text-center">
              <p className="text-slate-400">Nenhum registro encontrado com os filtros aplicados</p>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
