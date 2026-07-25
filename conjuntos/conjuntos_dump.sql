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

--
-- PostgreSQL database dump
--

\restrict 5miyux5E7T7mC2WVh07pg8fb6ppSFkY6tQ1f0l23Mv7DyyuZZUzRp70u2Vn8sdN

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

--
-- Data for Name: conjuntos; Type: TABLE DATA; Schema: public; Owner: -
--

SET SESSION AUTHORIZATION DEFAULT;

ALTER TABLE public.conjuntos DISABLE TRIGGER ALL;

COPY public.conjuntos (id, nombre, nit, subdominio, direccion, ciudad, logo_url, color_primario, plan, activo, representante_legal, notaria_escritura, numero_escritura, fecha_escritura, matricula_inmobiliaria, total_unidades, created_at) FROM stdin;
485658b1-99c5-478d-8c2b-208a24220fb0	Prueba E2E — uso real	Prueba E2E — uso real	pruebae2eusoreal	Prueba E2E — uso real	Prueba E2E — uso real	\N	#404040	BASICO	t	Prueba E2E — uso real	Prueba E2E — uso real	Prueba E2E — uso real	\N	\N	1	2026-06-25 02:33:15.356304+00
83048019-20e9-4929-a839-8bffb7f5ea11	Prueba E2E	Prueba E2E	pruebae2e	Prueba E2E	Prueba E2E	\N	#404040	BASICO	t	Prueba E2E	Prueba E2E	Prueba E2E	\N	\N	1	2026-06-25 02:47:18.806084+00
1db547c6-c3c8-43d8-ab4e-ad73f81a48cc	Conjunto E2E Provisioning	900123456-7	e2e-prov	Calle 123 #45-67	Bogotá	\N	#1E3A5F	BASICO	t	\N	\N	\N	\N	\N	50	2026-06-25 03:11:47.052109+00
04f9c168-9531-413b-b216-d8135842d57f	Salamanca Reservado Club House P.H.	900.123.456-7	demo	Calle 100 # 10-20	Bogota	data:image/jpeg;base64,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	#1E3A8A	PREMIUM	t	Maria Fernanda Gomez	Notaria 15 de Bogota	ESC-2026-00123	\N	MAT-50C-1234567	6	2026-06-12 18:28:46.643077+00
\.


ALTER TABLE public.conjuntos ENABLE TRIGGER ALL;

--
-- Data for Name: unidades; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.unidades DISABLE TRIGGER ALL;

COPY public.unidades (id, conjunto_id, numero, torre, piso, tipo, coeficiente) FROM stdin;
49760847-03f1-4704-8917-54068241ab0b	04f9c168-9531-413b-b216-d8135842d57f	S/N	S/T	\N	APARTAMENTO	0.000000
2fddfb8e-b373-494e-b5f8-c637a7ebbb1a	04f9c168-9531-413b-b216-d8135842d57f	S/N	S/T	\N	APARTAMENTO	0.000000
a66834c7-12d1-4326-a609-1f518b29b4a0	04f9c168-9531-413b-b216-d8135842d57f	1410	4	14	APARTAMENTO	0.000000
5049de4d-337e-497f-97df-b72f3a2bc314	04f9c168-9531-413b-b216-d8135842d57f	101	A	1	APARTAMENTO	0.012500
486610fe-830e-4cb1-9f1f-25b386db22fb	04f9c168-9531-413b-b216-d8135842d57f	202	B	2	APARTAMENTO	0.013750
4d83bb5e-f472-4d57-86a2-cc9c3ec608ac	04f9c168-9531-413b-b216-d8135842d57f	301	A	3	APARTAMENTO	0.015000
fa1878a9-a6eb-496a-8238-d404c96310fa	04f9c168-9531-413b-b216-d8135842d57f	C-01	C	1	CASA	0.020000
b0c57492-2ff2-4b1a-afaf-145aef6c0681	04f9c168-9531-413b-b216-d8135842d57f	L-05	L	0	LOCAL	0.008000
2518c26d-79b1-47f1-a7c6-baf932a80905	04f9c168-9531-413b-b216-d8135842d57f	1411	3	\N	APARTAMENTO	1.000000
7c885c5e-1aee-4208-a2e4-3e53351ac79e	04f9c168-9531-413b-b216-d8135842d57f	740	4	\N	APARTAMENTO	1.000000
\.


ALTER TABLE public.unidades ENABLE TRIGGER ALL;

--
-- PostgreSQL database dump complete
--

\unrestrict 5miyux5E7T7mC2WVh07pg8fb6ppSFkY6tQ1f0l23Mv7DyyuZZUzRp70u2Vn8sdN

