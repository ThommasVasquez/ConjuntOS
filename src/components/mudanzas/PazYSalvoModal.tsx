'use client';

import React from 'react';
import { ShieldCheck, CheckCircle2, Calendar, Clock, Truck, User, Building2, Printer, X, Award } from 'lucide-react';

export interface MudanzaItem {
  id: string;
  conjunto_id: string;
  usuario_id: string;
  usuario_nombre?: string;
  usuario_email?: string;
  torre?: string;
  apto?: string;
  tipo: 'ENTRANTE' | 'SALIENTE';
  fecha_mudanza: string;
  hora_inicio: string;
  hora_fin: string;
  tiene_vehiculo: boolean;
  vehiculo_placa?: string;
  vehiculo_tipo?: string;
  conductor_nombre?: string;
  conductor_documento?: string;
  observaciones?: string;
  estado: 'PENDIENTE_PAZ_Y_SALVO' | 'APROBADO' | 'RECHAZADO' | 'EN_PROCESO' | 'FINALIZADO';
  paz_y_salvo_codigo?: string;
  motivo_rechazo?: string;
  aprobado_por_nombre?: string;
  aprobado_at?: string;
  created_at: string;
}

interface Props {
  mudanza: MudanzaItem;
  conjuntoNombre?: string;
  onClose: () => void;
}

export default function PazYSalvoModal({ mudanza, conjuntoNombre = 'ConjuntOS® Copropiedad', onClose }: Props) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto print:p-0 print:bg-white print:static print:inset-auto">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden print:border-none print:shadow-none print:bg-white print:text-slate-900">
        
        {/* Modal Action Bar (Hidden in Print) */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900/90 border-b border-slate-800 print:hidden">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#57bf00]" />
            <span className="text-sm font-bold text-slate-200">Certificado Oficial de Paz y Salvo ConjuntOS®</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#57bf00] hover:bg-[#46a000] text-white text-xs font-bold transition shadow-lg shadow-[#57bf00]/20"
            >
              <Printer className="w-4 h-4" />
              Imprimir / Guardar PDF
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Certificate Content */}
        <div id="printable-certificate" className="p-8 sm:p-10 space-y-8 bg-slate-900 print:bg-white print:p-6 text-slate-100 print:text-slate-900">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 border-b border-slate-800 print:border-slate-300 pb-6">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-html-shortcut */}
              <img
                src="https://app.conjuntos.app/ConjuntOS_Horizontal.png"
                alt="ConjuntOS®"
                className="h-10 w-auto object-contain print:invert-0"
              />
            </div>
            <div className="text-center sm:text-right">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#57bf00]/10 text-[#57bf00] text-xs font-black tracking-wider border border-[#57bf00]/30 uppercase">
                <Award className="w-3.5 h-3.5" />
                Certificado Oficial
              </span>
              <p className="text-xs text-slate-400 print:text-slate-600 mt-1 font-medium">{conjuntoNombre}</p>
            </div>
          </div>

          {/* Title & Watermark Banner */}
          <div className="text-center space-y-2 relative">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white print:text-slate-900 uppercase">
              CERTIFICADO DE PAZ Y SALVO Y PERMISO DE MUDANZA
            </h1>
            <p className="text-xs text-slate-400 print:text-slate-600 font-medium">
              Expedido electrónicamente bajo verificación de cartera por la administración de <strong className="text-slate-200 print:text-slate-900">{conjuntoNombre}</strong> a través de <strong className="text-[#57bf00]">ConjuntOS®</strong>.
            </p>

            {/* Glowing Approval Stamp */}
            <div className="pt-2 flex justify-center">
              <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[#57bf00]/15 border-2 border-[#57bf00] text-[#57bf00] font-black text-sm shadow-xl shadow-[#57bf00]/10 tracking-wide uppercase">
                <CheckCircle2 className="w-5 h-5 text-[#57bf00]" />
                PAZ Y SALVO APROBADO &bull; {mudanza.paz_y_salvo_codigo || 'PZ-2026-AUT'}
              </div>
            </div>
          </div>

          {/* Main Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Resident & Unit */}
            <div className="p-4 rounded-2xl bg-slate-800/60 print:bg-slate-50 border border-slate-700/60 print:border-slate-200 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#57bf00] uppercase tracking-wider">
                <User className="w-4 h-4" />
                Titular del Inmueble
              </div>
              <p className="text-sm font-bold text-white print:text-slate-900">{mudanza.usuario_nombre || 'Residente Autorizado'}</p>
              <div className="flex items-center gap-2 text-xs text-slate-300 print:text-slate-700 font-medium">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                Torre {mudanza.torre || 'N/A'} &middot; Apto {mudanza.apto || 'N/A'}
              </div>
            </div>

            {/* Schedule & Window */}
            <div className="p-4 rounded-2xl bg-slate-800/60 print:bg-slate-50 border border-slate-700/60 print:border-slate-200 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#57bf00] uppercase tracking-wider">
                <Calendar className="w-4 h-4" />
                Fecha & Horario Habilitado
              </div>
              <p className="text-sm font-bold text-white print:text-slate-900">
                {new Date(mudanza.fecha_mudanza + 'T00:00:00').toLocaleDateString('es-CO', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
              <div className="flex items-center gap-2 text-xs text-slate-300 print:text-slate-700 font-bold">
                <Clock className="w-3.5 h-3.5 text-[#57bf00]" />
                Permiso: {mudanza.hora_inicio} a {mudanza.hora_fin}
              </div>
            </div>

            {/* Move Type & Vehicle */}
            <div className="p-4 rounded-2xl bg-slate-800/60 print:bg-slate-50 border border-slate-700/60 print:border-slate-200 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#57bf00] uppercase tracking-wider">
                <Truck className="w-4 h-4" />
                Detalles del Trasteo
              </div>
              <div className="flex items-center gap-2 text-sm font-bold text-white print:text-slate-900">
                <span>Tipo:</span>
                <span className="px-2 py-0.5 rounded-lg bg-blue-500/20 text-blue-400 print:bg-blue-100 print:text-blue-800 text-xs uppercase font-extrabold">
                  Mudanza {mudanza.tipo}
                </span>
              </div>
              {mudanza.tiene_vehiculo ? (
                <p className="text-xs text-slate-300 print:text-slate-700">
                  <strong>Vehículo:</strong> {mudanza.vehiculo_tipo || 'Camión'} ({mudanza.vehiculo_placa || 'Sin placa'})
                </p>
              ) : (
                <p className="text-xs text-slate-400 print:text-slate-600 italic">Sin vehículo registrado</p>
              )}
            </div>

            {/* Security Verification Code */}
            <div className="p-4 rounded-2xl bg-slate-800/60 print:bg-slate-50 border border-slate-700/60 print:border-slate-200 space-y-2 flex flex-col justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-[#57bf00] uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4" />
                Validación de Portería
              </div>
              <div className="text-xs text-slate-300 print:text-slate-700 space-y-1">
                <p><strong>Aprobado por:</strong> {mudanza.aprobado_por_nombre || 'Administración'}</p>
                <p className="text-[11px] text-slate-400"><strong>Validez:</strong> Válido exclusivamente en la fecha y horario estipulados.</p>
              </div>
            </div>

          </div>

          {/* Observations */}
          {mudanza.observaciones && (
            <div className="p-4 rounded-2xl bg-slate-950/40 print:bg-slate-100 border border-slate-800 print:border-slate-300 text-xs text-slate-300 print:text-slate-700">
              <strong className="text-white print:text-slate-900">Notas / Observaciones:</strong> {mudanza.observaciones}
            </div>
          )}

          {/* Footer & Signature line */}
          <div className="pt-6 border-t border-slate-800 print:border-slate-300 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400 print:text-slate-600">
            <div className="text-center sm:text-left space-y-1">
              <p className="font-bold text-slate-300 print:text-slate-800">&copy; {conjuntoNombre}</p>
              <p className="text-[11px]">Expedido electrónicamente por el sistema certificado <strong className="text-[#57bf00]">ConjuntOS®</strong>.</p>
            </div>
            <div className="text-center sm:text-right border-t sm:border-t-0 border-slate-700 pt-2 sm:pt-0">
              <p className="font-bold text-white print:text-slate-900">{mudanza.aprobado_por_nombre || 'Administrador Certificado'}</p>
              <p className="text-[10px] text-slate-500">Firma / Sello Digital Administración</p>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
