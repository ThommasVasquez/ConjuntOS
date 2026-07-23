--
-- PostgreSQL database dump
--

\restrict EBw9pnb86PAzkdekXWLYdozZuFX15Gw7WfUUnBvxQUfdvejWBl8c9MsIhdYiceU

-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: conjuntos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conjuntos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    nit text,
    subdominio text NOT NULL,
    direccion text NOT NULL,
    ciudad text NOT NULL,
    logo_url text,
    color_primario text DEFAULT '#1E3A5F'::text NOT NULL,
    plan text DEFAULT 'BASICO'::text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    representante_legal text,
    notaria_escritura text,
    numero_escritura text,
    fecha_escritura timestamp with time zone,
    matricula_inmobiliaria text,
    total_unidades integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT conjuntos_plan_check CHECK ((plan = ANY (ARRAY['BASICO'::text, 'PRO'::text, 'PREMIUM'::text])))
);


--
-- Name: unidades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unidades (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conjunto_id uuid NOT NULL,
    numero text NOT NULL,
    torre text,
    piso integer,
    tipo text NOT NULL,
    coeficiente numeric(9,6) NOT NULL,
    CONSTRAINT unidades_tipo_check CHECK ((tipo = ANY (ARRAY['APARTAMENTO'::text, 'CASA'::text, 'LOCAL'::text, 'PARQUEADERO'::text])))
);


--
-- Name: conjuntos conjuntos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conjuntos
    ADD CONSTRAINT conjuntos_pkey PRIMARY KEY (id);


--
-- Name: conjuntos conjuntos_subdominio_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conjuntos
    ADD CONSTRAINT conjuntos_subdominio_key UNIQUE (subdominio);


--
-- Name: unidades unidades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidades
    ADD CONSTRAINT unidades_pkey PRIMARY KEY (id);


--
-- Name: unidades_conjunto_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX unidades_conjunto_id_idx ON public.unidades USING btree (conjunto_id);


--
-- Name: unidades unidades_conjunto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidades
    ADD CONSTRAINT unidades_conjunto_id_fkey FOREIGN KEY (conjunto_id) REFERENCES public.conjuntos(id);


--
-- PostgreSQL database dump complete
--

\unrestrict EBw9pnb86PAzkdekXWLYdozZuFX15Gw7WfUUnBvxQUfdvejWBl8c9MsIhdYiceU

