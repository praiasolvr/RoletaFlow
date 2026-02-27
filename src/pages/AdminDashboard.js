import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LogOut, LayoutDashboard, Bus, Users, FileText, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function AdminDashboard() {
  const { userProfile, logout, currentUser } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    totalVehicles: 0,
    activeVehicles: 0,
    totalCompanies: 0,
    todayRecords: 0,
    mismatches: 0,
    openJourneys: 0
  });

  const [records, setRecords] = useState([]);
  const [mismatchRecords, setMismatchRecords] = useState([]);
  const [openJourneyRecords, setOpenJourneyRecords] = useState([]);

  useEffect(() => {
    loadStats();
    loadRecords();
  }, []);

  const loadStats = async () => {
    try {
      const vehiclesSnapshot = await getDocs(collection(db, 'vehicles'));
      const companiesSnapshot = await getDocs(collection(db, 'companies'));
      const recordsSnapshot = await getDocs(collection(db, 'turnstile_records'));

      const activeVehicles = vehiclesSnapshot.docs.filter(
        doc => doc.data().isActive
      ).length;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let todayCount = 0;
      let mismatchCount = 0;
      let openJourneyCount = 0;

      recordsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const recordDate = data.createdAt?.toDate() || new Date();

        if (recordDate >= today) {
          todayCount++;
        }

        if (data.physicalReading !== data.electronicReading) {
          mismatchCount++;
        }

        if (!data.journeyClosed) {
          openJourneyCount++;
        }
      });

      setStats({
        totalVehicles: vehiclesSnapshot.size,
        activeVehicles,
        totalCompanies: companiesSnapshot.size,
        todayRecords: todayCount,
        mismatches: mismatchCount,
        openJourneys: openJourneyCount
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const loadRecords = async () => {
    try {
      const recordsQuery = query(
        collection(db, 'turnstile_records'),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(recordsQuery);
      const allRecords = [];
      const mismatches = [];
      const openJourneys = [];

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();

        const vehicleDoc = await getDoc(doc(db, 'vehicles', data.vehicleId));
        const vehicleData = vehicleDoc.exists() ? vehicleDoc.data() : {};

        const record = {
          id: docSnap.id,
          ...data,
          vehicleNumber: vehicleData.number || 'N/A',
          vehiclePlate: vehicleData.plate || 'N/A'
        };

        allRecords.push(record);

        if (data.physicalReading !== data.electronicReading) {
          mismatches.push(record);
        }

        if (!data.journeyClosed) {
          openJourneys.push(record);
        }
      }

      setRecords(allRecords.slice(0, 20));
      setMismatchRecords(mismatches.slice(0, 10));
      setOpenJourneyRecords(openJourneys.slice(0, 20));
    } catch (error) {
      console.error('Error loading records:', error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Manrope, sans-serif' }}>RoletaFlow - Admin</h1>
            <p className="text-sm text-slate-400" style={{ fontFamily: 'Inter, sans-serif' }}>{userProfile?.name || currentUser?.email}</p>
          </div>
          <Button
            data-testid="logout-button"
            onClick={logout}
            variant="ghost"
            className="text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">

        {/* CARDS GERENCIAIS */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">

          <Card className="p-6 bg-slate-900/50 backdrop-blur-sm border-slate-800/50">
            <div className="flex items-center gap-3 mb-2">
              <Bus className="h-6 w-6 text-amber-500" />
              <h3 className="text-sm font-medium text-slate-400">Total Veículos</h3>
            </div>
            <p className="text-3xl font-bold text-white">{stats.totalVehicles}</p>
            <p className="text-xs text-emerald-500 mt-1">{stats.activeVehicles} ativos</p>
          </Card>

          <Card className="p-6 bg-slate-900/50 backdrop-blur-sm border-slate-800/50">
            <div className="flex items-center gap-3 mb-2">
              <Users className="h-6 w-6 text-amber-500" />
              <h3 className="text-sm font-medium text-slate-400">Empresas</h3>
            </div>
            <p className="text-3xl font-bold text-white">{stats.totalCompanies}</p>
          </Card>

          <Card className="p-6 bg-slate-900/50 backdrop-blur-sm border-slate-800/50">
            <div className="flex items-center gap-3 mb-2">
              <FileText className="h-6 w-6 text-amber-500" />
              <h3 className="text-sm font-medium text-slate-400">Registros Hoje</h3>
            </div>
            <p className="text-3xl font-bold text-white">{stats.todayRecords}</p>
          </Card>

          <Card className="p-6 bg-rose-900/20 backdrop-blur-sm border-rose-500/30">
            <div className="flex items-center gap-3 mb-2">
              <AlertTriangle className="h-6 w-6 text-rose-500" />
              <h3 className="text-sm font-medium text-rose-400">Discrepâncias</h3>
            </div>
            <p className="text-3xl font-bold text-rose-500">{stats.mismatches}</p>
          </Card>

          {/* NOVO CARD: JORNADAS ABERTAS */}
          <Card className="p-6 bg-amber-900/20 backdrop-blur-sm border-amber-500/30">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="h-6 w-6 text-amber-500" />
              <h3 className="text-sm font-medium text-amber-400">Jornadas Abertas</h3>
            </div>
            <p className="text-3xl font-bold text-amber-500">{stats.openJourneys}</p>
          </Card>

        </div>

        {/* BOTÕES */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Button onClick={() => navigate('/admin/companies')} className="h-20 bg-slate-800 hover:bg-slate-700 text-white">
            <Users className="mr-2 h-5 w-5" /> Gerenciar Empresas
          </Button>

          <Button onClick={() => navigate('/admin/vehicles')} className="h-20 bg-slate-800 hover:bg-slate-700 text-white">
            <Bus className="mr-2 h-5 w-5" /> Gerenciar Veículos
          </Button>

          <Button onClick={() => navigate('/admin/reports')} className="h-20 bg-slate-800 hover:bg-slate-700 text-white">
            <FileText className="mr-2 h-5 w-5" /> Relatórios
          </Button>

          <Button onClick={() => navigate('/operator/dashboard')} className="h-20 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold">
            <LayoutDashboard className="mr-2 h-5 w-5" /> Registrar Leitura
          </Button>
        </div>

        {/* TABS */}
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="bg-slate-900 border-slate-800">
            <TabsTrigger value="all" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-slate-950">
              Todos os Registros
            </TabsTrigger>

            <TabsTrigger value="mismatches" className="data-[state=active]:bg-rose-500 data-[state=active]:text-white">
              Discrepâncias
            </TabsTrigger>

            <TabsTrigger value="openJourneys" className="data-[state=active]:bg-amber-500 data-[state=active]:text-slate-950">
              Jornada Aberta
            </TabsTrigger>
          </TabsList>

          {/* TAB: TODOS */}
          <TabsContent value="all" className="mt-4">
            <div className="space-y-3">
              {records.map((record) => {
                const mismatch = record.physicalReading !== record.electronicReading;
                return (
                  <Card
                    key={record.id}
                    className={`p-4 bg-slate-900/50 backdrop-blur-sm ${mismatch ? 'border-rose-500/50 bg-rose-500/5' : 'border-slate-800/50'}`}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
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

                      <div>
                        <div className="text-xs text-slate-500">Física</div>
                        <div className={`text-xl font-mono font-bold ${mismatch ? 'text-rose-500' : 'text-white'}`}>
                          {record.physicalReading}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-slate-500">Eletrônica</div>
                        <div className={`text-xl font-mono font-bold ${mismatch ? 'text-rose-500' : 'text-white'}`}>
                          {record.electronicReading}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-slate-500">Jornada</div>
                        <div className="text-sm text-white">
                          {record.journeyClosed ? '✓ Fechada' : '⚠ Aberta'}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-sm text-white">{record.operatorName}</div>
                        <div className="text-xs text-slate-500">
                          {record.createdAt?.toDate?.()?.toLocaleString('pt-BR') || 'N/A'}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}

              {records.length === 0 && (
                <Card className="p-8 bg-slate-900/50 backdrop-blur-sm border-slate-800/50 text-center">
                  <p className="text-slate-400">Nenhum registro encontrado</p>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* TAB: DISCREPÂNCIAS */}
          <TabsContent value="mismatches" className="mt-4">
            <div className="space-y-3">
              {mismatchRecords.map((record) => (
                <Card key={record.id} className="p-4 bg-rose-900/10 backdrop-blur-sm border-rose-500/50">
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-rose-500" />
                      <div>
                        <div className="text-lg font-mono font-bold text-white">{record.vehicleNumber}</div>
                        <div className="text-sm text-slate-400 font-mono">{record.vehiclePlate}</div>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-slate-500">Física</div>
                      <div className="text-xl font-mono font-bold text-rose-500">{record.physicalReading}</div>
                    </div>

                    <div>
                      <div className="text-xs text-slate-500">Eletrônica</div>
                      <div className="text-xl font-mono font-bold text-rose-500">{record.electronicReading}</div>
                    </div>

                    <div>
                      <div className="text-xs text-slate-500">Diferença</div>
                      <div className="text-lg font-mono font-bold text-rose-500">
                        {Math.abs(record.physicalReading - record.electronicReading)}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm text-white">{record.operatorName}</div>
                      <div className="text-xs text-slate-500">
                        {record.createdAt?.toDate?.()?.toLocaleString('pt-BR') || 'N/A'}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}

              {mismatchRecords.length === 0 && (
                <Card className="p-8 bg-slate-900/50 backdrop-blur-sm border-slate-800/50 text-center">
                  <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-2" />
                  <p className="text-slate-400">Nenhuma discrepância encontrada!</p>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* TAB: JORNADAS ABERTAS */}
          <TabsContent value="openJourneys" className="mt-4">
            <div className="space-y-3">
              {openJourneyRecords.map((record) => (
                <Card key={record.id} className="p-4 bg-amber-900/10 backdrop-blur-sm border-amber-500/50">
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
                    <div className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-amber-500" />
                      <div>
                        <div className="text-lg font-mono font-bold text-white">{record.vehicleNumber}</div>
                        <div className="text-sm text-slate-400 font-mono">{record.vehiclePlate}</div>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-slate-500">Física</div>
                      <div className="text-xl font-mono font-bold text-white">{record.physicalReading}</div>
                    </div>

                    <div>
                      <div className="text-xs text-slate-500">Eletrônica</div>
                      <div className="text-xl font-mono font-bold text-white">{record.electronicReading}</div>
                    </div>

                    <div>
                      <div className="text-xs text-slate-500">Status</div>
                      <div className="text-lg font-mono font-bold text-amber-500">⚠ Aberta</div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm text-white">{record.operatorName}</div>
                      <div className="text-xs text-slate-500">
                        {record.createdAt?.toDate?.()?.toLocaleString('pt-BR') || 'N/A'}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}

              {openJourneyRecords.length === 0 && (
                <Card className="p-8 bg-slate-900/50 backdrop-blur-sm border-slate-800/50 text-center">
                  <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-2" />
                  <p className="text-slate-400">Nenhuma jornada aberta!</p>
                </Card>
              )}
            </div>
          </TabsContent>

        </Tabs>
      </main>
    </div>
  );
}
