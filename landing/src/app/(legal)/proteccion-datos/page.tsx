import type { Metadata } from "next";
import Link from "next/link";
import { Section, P, UL, Note } from "@/components/legal/Prose";

export const metadata: Metadata = {
  title: "Protección de Datos | ConjuntOS® 🏘️",
  description:
    "Tus derechos como titular de datos personales (Habeas Data) y cómo ejercerlos ante ConjuntOS® 🏘️, conforme a la Ley 1581 de 2012.",
};

export default function ProteccionDatosPage() {
  return (
    <article>
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">Legal</p>
      <h1 className="text-3xl font-bold font-[family-name:var(--font-serif)] md:text-4xl">
        Protección de Datos Personales
      </h1>
      <p className="mt-3 text-sm text-text-muted">
        Tus derechos como titular (Habeas Data) y cómo ejercerlos.
      </p>

      <Section id="derechos" title="Tus derechos">
        <P>Conforme a la Ley 1581 de 2012, como titular de tus datos personales tienes derecho a:</P>
        <UL>
          <li><strong>Conocer, actualizar y rectificar</strong> tus datos frente al responsable o encargado.</li>
          <li><strong>Solicitar prueba</strong> de la autorización otorgada, salvo cuando la ley no la exija.</li>
          <li><strong>Ser informado</strong> sobre el uso que se ha dado a tus datos.</li>
          <li><strong>Presentar quejas</strong> ante la Superintendencia de Industria y Comercio (SIC) por infracciones.</li>
          <li><strong>Revocar la autorización</strong> y/o <strong>solicitar la supresión</strong> del dato cuando no exista un deber legal o contractual de conservarlo.</li>
          <li><strong>Acceder gratuitamente</strong> a tus datos personales objeto de tratamiento.</li>
        </UL>
      </Section>

      <Section id="ejercer" title="Cómo ejercer tus derechos">
        <P>
          Envía tu solicitud (consulta o reclamo) al correo{" "}
          <strong>[protecciondedatos@enconjunto.co]</strong>, indicando tu nombre, documento, unidad y
          la petición concreta. Responderemos en los siguientes términos legales:
        </P>
        <UL>
          <li><strong>Consultas:</strong> se atienden en un máximo de <strong>diez (10) días hábiles</strong>. Si no es posible, te informaremos los motivos y la fecha en que se atenderá (no mayor a cinco días hábiles adicionales).</li>
          <li><strong>Reclamos:</strong> se resuelven en un máximo de <strong>quince (15) días hábiles</strong> desde el día siguiente a su recepción, prorrogables por ocho días hábiles más, informándote las razones.</li>
        </UL>
      </Section>

      <Section id="sic" title="Reclamo ante la autoridad">
        <P>
          Antes de acudir a la SIC, el titular debe agotar el trámite de consulta o reclamo ante nosotros.
          Si no obtienes respuesta satisfactoria, puedes presentar tu queja ante la{" "}
          <strong>Superintendencia de Industria y Comercio</strong> (
          <a
            href="https://www.sic.gov.co"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-text"
          >
            www.sic.gov.co
          </a>
          ), autoridad de control en Colombia.
        </P>
      </Section>

      <Section id="mas" title="Más información">
        <P>
          El detalle de las finalidades, los datos que tratamos, las cookies y la transferencia
          internacional a servidores en Estados Unidos está en nuestra{" "}
          <Link href="/privacidad" className="underline hover:text-text">
            Política de Privacidad y Tratamiento de Datos
          </Link>
          .
        </P>
        <Note>
          Los datos de contacto del responsable son provisionales y deben completarse con la información
          legal definitiva antes de la publicación oficial.
        </Note>
      </Section>
    </article>
  );
}
