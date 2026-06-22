// @generated automatically by Diesel CLI.

diesel::table! {
    ad_spaces (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        nombre -> Text,
        posicion -> Text,
        imagen_url -> Nullable<Text>,
        link_url -> Nullable<Text>,
        activo -> Bool,
        empresa -> Nullable<Text>,
        inicio_en -> Timestamptz,
        fin_en -> Timestamptz,
        impresiones -> Int4,
        clics -> Int4,
    }
}

diesel::table! {
    anuncios (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        titulo -> Text,
        contenido -> Text,
        tipo -> Text,
        imagen_url -> Nullable<Text>,
        archivos_url -> Jsonb,
        fijado -> Bool,
        publicado_en -> Timestamptz,
        expires_en -> Nullable<Timestamptz>,
        vistas -> Int4,
    }
}

diesel::table! {
    areas_comunes (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        nombre -> Text,
        descripcion -> Nullable<Text>,
        capacidad_max -> Int4,
        imagen_url -> Nullable<Text>,
        requiere_deposito -> Bool,
        deposito_monto -> Nullable<Numeric>,
        hora_apertura -> Text,
        hora_cierre -> Text,
        dias_disponibles -> Text,
        duracion_slot -> Int4,
        activa -> Bool,
    }
}

diesel::table! {
    asamblea_actas (id) {
        id -> Uuid,
        asamblea_id -> Uuid,
        contenido -> Text,
        generado_por -> Text,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    asamblea_asistencias (id) {
        id -> Uuid,
        asamblea_id -> Uuid,
        usuario_id -> Uuid,
        tipo -> Text,
        verificado -> Bool,
        ip -> Nullable<Text>,
        dispositivo -> Nullable<Text>,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    asamblea_opiniones (id) {
        id -> Uuid,
        asamblea_id -> Uuid,
        usuario_id -> Uuid,
        nombre -> Text,
        apto -> Nullable<Text>,
        contenido -> Text,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    asamblea_pairings (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        usuario_id -> Nullable<Uuid>,
        pin_hash -> Text,
        estado -> Text,
        expires_at -> Timestamptz,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    asamblea_poderes (id) {
        id -> Uuid,
        asamblea_id -> Uuid,
        otorgante_id -> Uuid,
        apoderado_id -> Uuid,
        documento_url -> Text,
        verificado -> Bool,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    asamblea_subtitulos (id) {
        id -> Uuid,
        asamblea_id -> Uuid,
        speaker -> Text,
        text -> Text,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    asamblea_turnos (id) {
        id -> Uuid,
        asamblea_id -> Uuid,
        usuario_id -> Uuid,
        nombre -> Text,
        apto -> Nullable<Text>,
        estado -> Text,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    asamblea_votaciones (id) {
        id -> Uuid,
        asamblea_id -> Uuid,
        titulo -> Text,
        descripcion -> Nullable<Text>,
        opciones -> Jsonb,
        activa -> Bool,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    asamblea_votos (id) {
        id -> Uuid,
        votacion_id -> Uuid,
        usuario_id -> Uuid,
        unidad_id -> Nullable<Uuid>,
        respuesta -> Text,
        coeficiente -> Numeric,
        es_virtual -> Bool,
        hash_firma -> Text,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    asambleas (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        titulo -> Text,
        descripcion -> Nullable<Text>,
        fecha -> Timestamptz,
        activa -> Bool,
        orden_dia -> Jsonb,
        item_activo_index -> Int4,
        session_state -> Jsonb,
        version -> Int4,
    }
}

diesel::table! {
    chat_admin (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        usuario_id -> Uuid,
        mensaje -> Text,
        audio_url -> Nullable<Text>,
        transcripcion -> Nullable<Text>,
        es_de_admin -> Bool,
        leido -> Bool,
        huesped_id -> Nullable<Uuid>,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    conjuntos (id) {
        id -> Uuid,
        nombre -> Text,
        nit -> Nullable<Text>,
        subdominio -> Text,
        direccion -> Text,
        ciudad -> Text,
        logo_url -> Nullable<Text>,
        color_primario -> Text,
        plan -> Text,
        activo -> Bool,
        representante_legal -> Nullable<Text>,
        notaria_escritura -> Nullable<Text>,
        numero_escritura -> Nullable<Text>,
        fecha_escritura -> Nullable<Timestamptz>,
        matricula_inmobiliaria -> Nullable<Text>,
        total_unidades -> Nullable<Int4>,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    documentos (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        nombre -> Text,
        categoria -> Text,
        url -> Text,
        version -> Nullable<Text>,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    gastos (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        categoria -> Text,
        descripcion -> Text,
        monto -> Numeric,
        proveedor -> Nullable<Text>,
        soporte_url -> Nullable<Text>,
        fecha -> Timestamptz,
        aprobado_por -> Nullable<Text>,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    inmuebles (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        usuario_id -> Uuid,
        titulo -> Text,
        descripcion -> Text,
        precio -> Numeric,
        tipo_negocio -> Text,
        tipo_unidad -> Text,
        habitaciones -> Int4,
        banos -> Int4,
        area -> Nullable<Numeric>,
        moneda -> Text,
        telefono_contacto -> Nullable<Text>,
        whatsapp_contacto -> Nullable<Text>,
        imagenes -> Jsonb,
        caracteristicas -> Jsonb,
        estado -> Text,
        destacado -> Bool,
        created_at -> Timestamptz,
        updated_at -> Timestamptz,
    }
}

diesel::table! {
    juntas (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        tipo -> Text,
        fecha -> Timestamptz,
        titulo -> Text,
        descripcion -> Nullable<Text>,
        transcripcion -> Nullable<Text>,
        audio_url -> Nullable<Text>,
        acta_url -> Nullable<Text>,
        publicada -> Bool,
    }
}

diesel::table! {
    locales (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        nombre -> Text,
        categoria -> Text,
        descripcion -> Nullable<Text>,
        precio -> Nullable<Numeric>,
        imagen_url -> Nullable<Text>,
        activo -> Bool,
        telefono -> Nullable<Text>,
        whatsapp -> Nullable<Text>,
        propietario_id -> Nullable<Uuid>,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    mascotas (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        usuario_id -> Uuid,
        nombre -> Text,
        tipo -> Text,
        raza -> Nullable<Text>,
        foto_url -> Nullable<Text>,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    notificaciones (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        usuario_id -> Uuid,
        tipo -> Text,
        titulo -> Text,
        mensaje -> Text,
        leida -> Bool,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    pagos (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        unidad_id -> Uuid,
        usuario_id -> Uuid,
        concepto -> Text,
        monto -> Numeric,
        estado -> Text,
        metodo -> Nullable<Text>,
        wompi_ref -> Nullable<Text>,
        fecha_vencimiento -> Timestamptz,
        fecha_pago -> Nullable<Timestamptz>,
        comprobante -> Nullable<Text>,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    paquetes (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        usuario_id -> Uuid,
        descripcion -> Text,
        remitente -> Text,
        estado -> Text,
        fecha_llegada -> Timestamptz,
        entregado_en -> Nullable<Timestamptz>,
    }
}

diesel::table! {
    correspondencia (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        usuario_id -> Uuid,
        tipo -> Text,
        remitente -> Text,
        descripcion -> Nullable<Text>,
        estado -> Text,
        fecha_llegada -> Timestamptz,
        entregado_en -> Nullable<Timestamptz>,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    novedades_seguridad (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        usuario_id -> Uuid,
        tipo -> Text,
        ubicacion -> Nullable<Text>,
        descripcion -> Text,
        severidad -> Text,
        estado -> Text,
        resuelto_por -> Nullable<Uuid>,
        resolucion -> Nullable<Text>,
        created_at -> Timestamptz,
        resuelto_en -> Nullable<Timestamptz>,
    }
}

diesel::table! {
    parqueaderos (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        numero -> Text,
        torre -> Nullable<Text>,
        tipo -> Text,
        estado -> Text,
        usuario_id -> Nullable<Uuid>,
        created_at -> Timestamptz,
        asignado_en -> Nullable<Timestamptz>,
        asignado_hasta -> Nullable<Timestamptz>,
        categoria -> Text,
    }
}

diesel::table! {
    pedidos (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        local_id -> Uuid,
        usuario_id -> Uuid,
        items -> Jsonb,
        total -> Numeric,
        estado -> Text,
        notas -> Nullable<Text>,
        unidad_entrega -> Text,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    productos (id) {
        id -> Uuid,
        local_id -> Uuid,
        nombre -> Text,
        descripcion -> Nullable<Text>,
        precio -> Numeric,
        imagen_url -> Nullable<Text>,
    }
}

diesel::table! {
    push_subscriptions (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        usuario_id -> Uuid,
        endpoint -> Text,
        p256dh -> Text,
        auth -> Text,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    pases_temporales (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        propietario_id -> Uuid,
        unidad_id -> Uuid,
        nombre_anfitrion -> Text,
        nombre_huesped -> Text,
        email_huesped -> Nullable<Text>,
        telefono_huesped -> Nullable<Text>,
        codigo_acceso -> Text,
        fecha_inicio -> Date,
        fecha_fin -> Date,
        permiso_gimnasio -> Bool,
        permiso_piscina -> Bool,
        permiso_entrada_salida -> Bool,
        permiso_vehiculo -> Bool,
        permiso_asamblea -> Bool,
        estado -> Text,
        usuario_id -> Nullable<Uuid>,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    vehiculos_temporales (id) {
        id -> Uuid,
        pase_id -> Uuid,
        placa -> Text,
        marca -> Nullable<Text>,
        modelo -> Nullable<Text>,
        color -> Nullable<Text>,
    }
}

diesel::table! {
    comite_historicos (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        periodo_inicio -> Date,
        periodo_fin -> Date,
        elegido_en_asamblea_id -> Nullable<Uuid>,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    comite_miembros (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        comite_historico_id -> Uuid,
        usuario_id -> Uuid,
        calidad -> Text,
        unidad_id -> Uuid,
        activo -> Bool,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    casos_convivencia (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        tipo -> Text,
        descripcion -> Text,
        unidad_reporta_id -> Uuid,
        unidad_reportada_id -> Nullable<Uuid>,
        creado_por -> Uuid,
        miembro_asignado_id -> Nullable<Uuid>,
        estado -> Text,
        resolucion -> Nullable<Text>,
        sesion_mediacion_fecha -> Nullable<Date>,
        sesion_mediacion_notas -> Nullable<Text>,
        created_at -> Timestamptz,
        updated_at -> Timestamptz,
    }
}

diesel::table! {
    actas_convivencia (id) {
        id -> Uuid,
        caso_id -> Uuid,
        contenido -> Text,
        pdf_url -> Nullable<Text>,
        firmada -> Bool,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    firmas_actas (id) {
        id -> Uuid,
        acta_id -> Uuid,
        usuario_id -> Uuid,
        tipo -> Text,
        firmado_en -> Timestamptz,
    }
}

diesel::table! {
    recibos_publicos (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        unidad_id -> Uuid,
        servicio -> Text,
        empresa -> Text,
        periodo -> Text,
        monto -> Numeric,
        vencimiento -> Timestamptz,
        url_recibo -> Nullable<Text>,
        pagado -> Bool,
        fecha_pago -> Nullable<Timestamptz>,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    registros_parqueadero (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        parqueadero_id -> Uuid,
        usuario_id -> Uuid,
        tipo -> Text,
        placa -> Nullable<Text>,
        observacion -> Nullable<Text>,
        fecha -> Timestamptz,
    }
}

diesel::table! {
    reservas (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        usuario_id -> Uuid,
        area_id -> Uuid,
        fecha_inicio -> Timestamptz,
        fecha_fin -> Timestamptz,
        estado -> Text,
        notas -> Nullable<Text>,
        pago_id -> Nullable<Uuid>,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    reservas_visitante_parqueadero (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        residente_id -> Uuid,
        residente_nombre -> Text,
        unidad_id -> Nullable<Uuid>,
        categoria -> Text,
        visitante_nombre -> Nullable<Text>,
        placa -> Nullable<Text>,
        llegada_estimada -> Timestamptz,
        duracion_minutos -> Nullable<Int4>,
        fin_estimado -> Nullable<Timestamptz>,
        estado -> Text,
        sesion_id -> Nullable<Uuid>,
        notas -> Nullable<Text>,
        created_at -> Timestamptz,
        updated_at -> Timestamptz,
    }
}

diesel::table! {
    rondas_parqueadero (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        usuario_id -> Uuid,
        fecha -> Timestamptz,
        hallazgos -> Nullable<Jsonb>,
        completada -> Bool,
    }
}

diesel::table! {
    puntos_ronda (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        nfc_uid -> Varchar,
        nombre -> Varchar,
        ubicacion -> Nullable<Varchar>,
        orden -> Int4,
        activo -> Bool,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    checkpoints_ronda (id) {
        id -> Uuid,
        ronda_id -> Uuid,
        punto_id -> Uuid,
        nfc_uid -> Varchar,
        verificado_en -> Timestamptz,
    }
}

diesel::table! {
    sesiones_parqueadero (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        parqueadero_id -> Nullable<Uuid>,
        celda_numero -> Text,
        solicitud_id -> Nullable<Uuid>,
        residente_id -> Uuid,
        residente_nombre -> Text,
        unidad_id -> Nullable<Uuid>,
        placa -> Nullable<Text>,
        estimado_minutos -> Nullable<Int4>,
        inicio -> Timestamptz,
        minutos_gratis -> Int4,
        fin_gratis -> Timestamptz,
        tarifa_hora -> Numeric,
        aviso_20_enviado -> Bool,
        aviso_cobro_enviado -> Bool,
        estado -> Text,
        cerrado_en -> Nullable<Timestamptz>,
        minutos_cobrados -> Nullable<Int4>,
        monto -> Nullable<Numeric>,
        liquidacion -> Nullable<Text>,
        pago_id -> Nullable<Uuid>,
        created_at -> Timestamptz,
        cargo_resuelto_en -> Nullable<Timestamptz>,
    }
}

diesel::table! {
    solicitudes_parqueadero (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        parqueadero_id -> Nullable<Uuid>,
        celda_numero -> Text,
        accion -> Text,
        estado -> Text,
        requiere_aprobacion -> Bool,
        detalle -> Text,
        payload -> Nullable<Jsonb>,
        solicitante_id -> Uuid,
        solicitante_nombre -> Text,
        solicitante_rol -> Text,
        creado_en -> Timestamptz,
        aprobador_id -> Nullable<Uuid>,
        aprobador_nombre -> Nullable<Text>,
        resuelto_en -> Nullable<Timestamptz>,
        destinatario_id -> Nullable<Uuid>,
        destinatario_nombre -> Nullable<Text>,
    }
}

diesel::table! {
    solicitudes_servicio (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        usuario_id -> Uuid,
        categoria -> Text,
        tipo -> Text,
        descripcion -> Text,
        urgente -> Bool,
        imagenes -> Jsonb,
        estado -> Text,
        proveedor_id -> Nullable<Uuid>,
        prioridad -> Text,
        sla_horas -> Int4,
        sla_vencimiento -> Nullable<Timestamptz>,
        asignado_a_id -> Nullable<Uuid>,
        fecha_asignacion -> Nullable<Timestamptz>,
        fecha_resolucion -> Nullable<Timestamptz>,
        fecha_cierre -> Nullable<Timestamptz>,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    ticket_comentarios (id) {
        id -> Uuid,
        ticket_id -> Uuid,
        usuario_id -> Uuid,
        contenido -> Text,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    ticket_transiciones (id) {
        id -> Uuid,
        ticket_id -> Uuid,
        estado_anterior -> Text,
        estado_nuevo -> Text,
        usuario_id -> Uuid,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    tramites (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        usuario_id -> Uuid,
        tipo -> Text,
        estado -> Text,
        payload -> Jsonb,
        documentos -> Jsonb,
        observacion_admin -> Nullable<Text>,
        aprobado_por_id -> Nullable<Uuid>,
        fecha_respuesta -> Nullable<Timestamptz>,
        created_at -> Timestamptz,
        updated_at -> Timestamptz,
    }
}

diesel::table! {
    unidades (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        numero -> Text,
        torre -> Nullable<Text>,
        piso -> Nullable<Int4>,
        tipo -> Text,
        coeficiente -> Numeric,
    }
}

diesel::table! {
    usuarios (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        nombre -> Text,
        email -> Text,
        password_hash -> Text,
        must_change_password -> Bool,
        telefono -> Nullable<Text>,
        rol -> Text,
        unidad_id -> Nullable<Uuid>,
        avatar -> Nullable<Text>,
        torre -> Nullable<Text>,
        apto -> Nullable<Text>,
        genero -> Nullable<Text>,
        activo -> Bool,
        created_at -> Timestamptz,
        password_changed_at -> Timestamptz,
        numero_interno -> Text,
        last_login_at -> Nullable<Timestamptz>,
    }
}

diesel::table! {
    vehiculos (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        usuario_id -> Uuid,
        placa -> Text,
        marca -> Nullable<Text>,
        modelo -> Nullable<Text>,
        color -> Nullable<Text>,
        tipo -> Text,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    visitas (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        usuario_id -> Uuid,
        nombre -> Text,
        tipo -> Text,
        vehiculo_tipo -> Nullable<Text>,
        placa -> Nullable<Text>,
        fecha -> Timestamptz,
        tiene_parqueadero -> Bool,
        observacion -> Nullable<Text>,
        created_at -> Timestamptz,
        token -> Nullable<Text>,
        token_expira -> Nullable<Timestamptz>,
        ingreso_at -> Nullable<Timestamptz>,
    }
}

diesel::joinable!(ad_spaces -> conjuntos (conjunto_id));
diesel::joinable!(anuncios -> conjuntos (conjunto_id));
diesel::joinable!(areas_comunes -> conjuntos (conjunto_id));
diesel::joinable!(asamblea_actas -> asambleas (asamblea_id));
diesel::joinable!(asamblea_asistencias -> asambleas (asamblea_id));
diesel::joinable!(asamblea_asistencias -> usuarios (usuario_id));
diesel::joinable!(asamblea_opiniones -> asambleas (asamblea_id));
diesel::joinable!(asamblea_opiniones -> usuarios (usuario_id));
diesel::joinable!(asamblea_pairings -> conjuntos (conjunto_id));
diesel::joinable!(asamblea_pairings -> usuarios (usuario_id));
diesel::joinable!(asamblea_poderes -> asambleas (asamblea_id));
diesel::joinable!(asamblea_subtitulos -> asambleas (asamblea_id));
diesel::joinable!(asamblea_turnos -> asambleas (asamblea_id));
diesel::joinable!(asamblea_turnos -> usuarios (usuario_id));
diesel::joinable!(asamblea_votaciones -> asambleas (asamblea_id));
diesel::joinable!(asamblea_votos -> asamblea_votaciones (votacion_id));
diesel::joinable!(asamblea_votos -> unidades (unidad_id));
diesel::joinable!(asamblea_votos -> usuarios (usuario_id));
diesel::joinable!(asambleas -> conjuntos (conjunto_id));
diesel::joinable!(chat_admin -> conjuntos (conjunto_id));
diesel::joinable!(chat_admin -> usuarios (usuario_id));
diesel::joinable!(correspondencia -> conjuntos (conjunto_id));
diesel::joinable!(correspondencia -> usuarios (usuario_id));
diesel::joinable!(novedades_seguridad -> conjuntos (conjunto_id));
diesel::joinable!(novedades_seguridad -> usuarios (usuario_id));
diesel::joinable!(documentos -> conjuntos (conjunto_id));
diesel::joinable!(gastos -> conjuntos (conjunto_id));
diesel::joinable!(inmuebles -> conjuntos (conjunto_id));
diesel::joinable!(inmuebles -> usuarios (usuario_id));
diesel::joinable!(juntas -> conjuntos (conjunto_id));
diesel::joinable!(locales -> conjuntos (conjunto_id));
diesel::joinable!(locales -> usuarios (propietario_id));
diesel::joinable!(mascotas -> conjuntos (conjunto_id));
diesel::joinable!(mascotas -> usuarios (usuario_id));
diesel::joinable!(notificaciones -> conjuntos (conjunto_id));
diesel::joinable!(notificaciones -> usuarios (usuario_id));
diesel::joinable!(pagos -> conjuntos (conjunto_id));
diesel::joinable!(pagos -> unidades (unidad_id));
diesel::joinable!(pagos -> usuarios (usuario_id));
diesel::joinable!(paquetes -> conjuntos (conjunto_id));
diesel::joinable!(paquetes -> usuarios (usuario_id));
diesel::joinable!(parqueaderos -> conjuntos (conjunto_id));
diesel::joinable!(parqueaderos -> usuarios (usuario_id));
diesel::joinable!(pedidos -> conjuntos (conjunto_id));
diesel::joinable!(pedidos -> locales (local_id));
diesel::joinable!(pedidos -> usuarios (usuario_id));
diesel::joinable!(productos -> locales (local_id));
diesel::joinable!(push_subscriptions -> conjuntos (conjunto_id));
diesel::joinable!(push_subscriptions -> usuarios (usuario_id));
diesel::joinable!(recibos_publicos -> conjuntos (conjunto_id));
diesel::joinable!(recibos_publicos -> unidades (unidad_id));
diesel::joinable!(registros_parqueadero -> conjuntos (conjunto_id));
diesel::joinable!(registros_parqueadero -> parqueaderos (parqueadero_id));
diesel::joinable!(registros_parqueadero -> usuarios (usuario_id));
diesel::joinable!(reservas -> areas_comunes (area_id));
diesel::joinable!(reservas -> conjuntos (conjunto_id));
diesel::joinable!(reservas -> usuarios (usuario_id));
diesel::joinable!(rondas_parqueadero -> conjuntos (conjunto_id));
diesel::joinable!(rondas_parqueadero -> usuarios (usuario_id));
diesel::joinable!(puntos_ronda -> conjuntos (conjunto_id));
diesel::joinable!(checkpoints_ronda -> puntos_ronda (punto_id));
diesel::joinable!(checkpoints_ronda -> rondas_parqueadero (ronda_id));
diesel::joinable!(sesiones_parqueadero -> conjuntos (conjunto_id));
diesel::joinable!(sesiones_parqueadero -> parqueaderos (parqueadero_id));
diesel::joinable!(sesiones_parqueadero -> unidades (unidad_id));
diesel::joinable!(sesiones_parqueadero -> pagos (pago_id));
diesel::joinable!(solicitudes_servicio -> conjuntos (conjunto_id));
diesel::joinable!(solicitudes_servicio -> usuarios (usuario_id));
diesel::joinable!(ticket_comentarios -> solicitudes_servicio (ticket_id));
diesel::joinable!(ticket_comentarios -> usuarios (usuario_id));
diesel::joinable!(ticket_transiciones -> solicitudes_servicio (ticket_id));
diesel::joinable!(ticket_transiciones -> usuarios (usuario_id));
diesel::joinable!(solicitudes_parqueadero -> conjuntos (conjunto_id));
diesel::joinable!(solicitudes_parqueadero -> parqueaderos (parqueadero_id));
diesel::joinable!(tramites -> conjuntos (conjunto_id));
diesel::joinable!(unidades -> conjuntos (conjunto_id));
diesel::joinable!(usuarios -> conjuntos (conjunto_id));
diesel::joinable!(usuarios -> unidades (unidad_id));
diesel::joinable!(vehiculos -> conjuntos (conjunto_id));
diesel::joinable!(vehiculos -> usuarios (usuario_id));
diesel::joinable!(vehiculos_temporales -> pases_temporales (pase_id));
diesel::joinable!(visitas -> conjuntos (conjunto_id));
diesel::joinable!(visitas -> usuarios (usuario_id));
diesel::joinable!(pases_temporales -> conjuntos (conjunto_id));
diesel::joinable!(pases_temporales -> usuarios (propietario_id));
diesel::joinable!(pases_temporales -> unidades (unidad_id));
diesel::joinable!(casos_convivencia -> conjuntos (conjunto_id));
diesel::joinable!(casos_convivencia -> unidades (unidad_reporta_id));
diesel::joinable!(casos_convivencia -> usuarios (creado_por));
diesel::joinable!(comite_historicos -> conjuntos (conjunto_id));
diesel::joinable!(comite_miembros -> conjuntos (conjunto_id));
diesel::joinable!(comite_miembros -> comite_historicos (comite_historico_id));
diesel::joinable!(comite_miembros -> usuarios (usuario_id));
diesel::joinable!(comite_miembros -> unidades (unidad_id));
diesel::joinable!(actas_convivencia -> casos_convivencia (caso_id));
diesel::joinable!(firmas_actas -> actas_convivencia (acta_id));
diesel::joinable!(firmas_actas -> usuarios (usuario_id));

diesel::table! {
    encuestas (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        creado_por -> Uuid,
        titulo -> Text,
        descripcion -> Nullable<Text>,
        opciones -> Jsonb,
        multiple -> Bool,
        anonima -> Bool,
        cierra_at -> Nullable<Timestamptz>,
        cerrada -> Bool,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    encuesta_participacion (id) {
        id -> Uuid,
        encuesta_id -> Uuid,
        usuario_id -> Uuid,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    encuesta_votos (id) {
        id -> Uuid,
        encuesta_id -> Uuid,
        opcion_id -> Text,
        usuario_id -> Nullable<Uuid>,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    sos_alertas (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        usuario_id -> Uuid,
        tipo -> Text,
        estado -> Text,
        nota -> Nullable<Text>,
        ubicacion -> Nullable<Text>,
        atendida_por_id -> Nullable<Uuid>,
        fecha_atendida -> Nullable<Timestamptz>,
        resuelta_por_id -> Nullable<Uuid>,
        fecha_resuelta -> Nullable<Timestamptz>,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    recordatorios_enviados (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        usuario_id -> Uuid,
        source -> Text,
        row_id -> Uuid,
        lead_dias -> Int4,
        fecha -> Date,
        created_at -> Timestamptz,
    }
}

diesel::allow_tables_to_appear_in_same_query!(
    ad_spaces,
    anuncios,
    areas_comunes,
    asamblea_actas,
    asamblea_asistencias,
    asamblea_opiniones,
    asamblea_pairings,
    asamblea_poderes,
    asamblea_subtitulos,
    asamblea_turnos,
    asamblea_votaciones,
    asamblea_votos,
    asambleas,
    chat_admin,
    conjuntos,
    correspondencia,
    documentos,
    encuesta_participacion,
    encuesta_votos,
    encuestas,
    gastos,
    inmuebles,
    juntas,
    locales,
    mascotas,
    notificaciones,
    novedades_seguridad,
    pagos,
    paquetes,
    parqueaderos,
    pedidos,
    productos,
    push_subscriptions,
    recibos_publicos,
    recordatorios_enviados,
    registros_parqueadero,
    reservas,
    reservas_visitante_parqueadero,
    rondas_parqueadero,
    checkpoints_ronda,
    puntos_ronda,
    sesiones_parqueadero,
    solicitudes_parqueadero,
    solicitudes_servicio,
    sos_alertas,
    tramites,
    unidades,
    usuarios,
    vehiculos,
    vehiculos_temporales,
    visitas,
    pases_temporales,
    casos_convivencia,
    comite_historicos,
    comite_miembros,
    actas_convivencia,
    firmas_actas,
    ticket_comentarios,
    ticket_transiciones,
);