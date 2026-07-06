import type { Metadata } from "next";
import Link from "next/link";
import { Section, P, UL, Note } from "@/components/legal/Prose";

export const metadata: Metadata = {
  title: "Política de Privacidad y Tratamiento de Datos | EN-CONJUNTO",
  description:
    "Política de Tratamiento de Datos Personales y Aviso de Privacidad de EN-CONJUNTO, conforme a la Ley 1581 de 2012 y el Decreto 1074 de 2015.",
};

export default function PrivacidadPage() {
  return (
    <article>
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">
        Legal
      </p>
      <h1 className="text-3xl font-bold font-[family-name:var(--font-serif)] md:text-4xl">
        Política de Privacidad y Tratamiento de Datos Personales
      </h1>
      <p className="mt-3 text-sm text-text-muted">
        Última actualización: 6 de julio de 2026 · Versión 1.0
      </p>

      <div className="mt-8">
        <Note>
          <strong>Plantilla base.</strong> Este documento debe completarse con los datos legales
          definitivos del responsable (razón social, NIT, domicilio y correo) y ser revisado por un
          abogado antes de su publicación oficial. Los campos entre corchetes <code>[ ]</code> son
          marcadores de posición.
        </Note>
      </div>

      <Section id="responsable" title="1. Responsable del tratamiento">
        <P>
          El responsable del tratamiento de los datos personales recolectados a través de la
          plataforma EN-CONJUNTO es <strong>ENERGYSOFTmedia S.A.S.</strong> (o la copropiedad
          administradora que corresponda), identificada con NIT <strong>[NIT]</strong>, con domicilio
          en <strong>[ciudad, Colombia]</strong>.
        </P>
        <UL>
          <li>Correo de contacto para protección de datos: <strong>[protecciondedatos@enconjunto.co]</strong></li>
          <li>Teléfono: <strong>[teléfono]</strong></li>
          <li>Dirección física: <strong>[dirección]</strong></li>
        </UL>
      </Section>

      <Section id="marco" title="2. Marco legal">
        <P>
          Esta política se rige por la Constitución Política de Colombia (art. 15), la Ley
          Estatutaria 1581 de 2012, el Decreto 1074 de 2015 (que compila el Decreto 1377 de 2013) y
          las circulares e instrucciones de la Superintendencia de Industria y Comercio (SIC), autoridad
          colombiana de protección de datos.
        </P>
      </Section>

      <Section id="datos" title="3. Datos personales que tratamos">
        <P>Según el rol de cada persona (residente, administración, vigilancia, huésped, etc.), podemos tratar:</P>
        <UL>
          <li><strong>Identificación y contacto:</strong> nombre, documento, correo, teléfono, torre y apartamento.</li>
          <li><strong>Unidad y convivencia:</strong> estado de cuenta, mascotas y vehículos registrados, paquetería y correspondencia.</li>
          <li><strong>Acceso y seguridad:</strong> registro de visitas, pases temporales, imágenes de videovigilancia (CCTV), rondas y novedades.</li>
          <li><strong>Financieros:</strong> pagos de administración y datos necesarios para conciliarlos con la pasarela (p. ej. Nequi).</li>
          <li><strong>Ubicación:</strong> ubicación aproximada asociada a una alerta de pánico (SOS), únicamente cuando el titular la activa.</li>
          <li><strong>Técnicos:</strong> datos de sesión, dispositivo y cookies (ver sección 8).</li>
        </UL>
      </Section>

      <Section id="sensibles" title="4. Datos sensibles y de menores de edad">
        <P>
          Algunos datos pueden ser sensibles (por ejemplo, imágenes que revelen características de las
          personas) o corresponder a niños, niñas y adolescentes. Estos reciben protección reforzada:
          su tratamiento es facultativo, requiere autorización explícita y se realiza siempre en interés
          superior del menor y con finalidades legítimas. La videovigilancia se limita a fines de
          seguridad, con zonas señalizadas y plazos de conservación acotados.
        </P>
      </Section>

      <Section id="finalidades" title="5. Finalidades del tratamiento">
        <UL>
          <li>Prestar y administrar los servicios de la plataforma para la copropiedad.</li>
          <li>Gestionar el control de acceso, la seguridad y la portería del conjunto.</li>
          <li>Procesar pagos, cartera, multas y comunicaciones administrativas.</li>
          <li>Facilitar asambleas, votaciones, encuestas y trámites (PQRS).</li>
          <li>Enviar notificaciones operativas y de seguridad.</li>
          <li>Cumplir obligaciones legales y atender a las autoridades competentes.</li>
        </UL>
      </Section>

      <Section id="autorizacion" title="6. Autorización del titular">
        <P>
          Salvo las excepciones legales, el tratamiento requiere autorización previa, expresa e informada
          del titular, que se obtiene al registrarse o aceptar esta política. El titular puede revocar su
          autorización en cualquier momento, sin efectos retroactivos, por los canales de la sección 11.
        </P>
      </Section>

      <Section id="cookies" title="7. Cookies y tecnologías similares">
        <P>
          Usamos cookies y almacenamiento local para el funcionamiento, la seguridad y la mejora de la
          plataforma. Al ingresar verás un aviso para <strong>aceptar</strong> o <strong>rechazar</strong>
          las cookies no esenciales; tu elección se guarda en tu navegador.
        </P>
        <UL>
          <li><strong>Necesarias:</strong> sesión, autenticación y seguridad. No pueden desactivarse.</li>
          <li><strong>Funcionales:</strong> recuerdan preferencias como el tema claro/oscuro.</li>
          <li><strong>Analíticas:</strong> nos ayudan a entender el uso de la plataforma (solo si las aceptas).</li>
        </UL>
        <P>Puedes eliminar o bloquear cookies desde la configuración de tu navegador; algunas funciones podrían verse afectadas.</P>
      </Section>

      <Section id="transferencia" title="8. Transferencia y transmisión internacional de datos">
        <P>
          La infraestructura de EN-CONJUNTO está alojada en servidores ubicados en los{" "}
          <strong>Estados Unidos de América</strong>. La legislación colombiana{" "}
          <strong>no exige</strong> que los datos se almacenen en Colombia; regula su transferencia
          internacional (art. 26 de la Ley 1581 de 2012).
        </P>
        <P>
          Estados Unidos figura en la lista de países con <strong>nivel adecuado de protección</strong>
          {" "}reconocidos por la SIC (Circular Externa 005 de 2017 y concordantes), por lo que la
          transferencia está permitida sin autorización especial de la SIC. Adicionalmente, con nuestros
          proveedores (encargados) en el exterior suscribimos <strong>contratos de transmisión de datos</strong>
          {" "}con cláusulas contractuales conforme a las Circulares Externas 002 y 003 de 2025, y aplicamos
          medidas de seguridad apropiadas.
        </P>
      </Section>

      <Section id="encargados" title="9. Encargados y terceros">
        <P>
          Compartimos datos con proveedores que actúan como encargados únicamente para las finalidades de
          esta política: proveedor de infraestructura/alojamiento, pasarela de pagos (p. ej. Nequi),
          servicios de notificaciones y de video para asambleas. No vendemos datos personales.
        </P>
      </Section>

      <Section id="conservacion" title="10. Conservación y seguridad">
        <P>
          Conservamos los datos mientras exista la relación con la copropiedad y por los plazos exigidos
          por la ley. Aplicamos medidas técnicas y organizativas razonables (cifrado, control de acceso y
          copias de seguridad) para prevenir el acceso, pérdida o alteración no autorizados.
        </P>
      </Section>

      <Section id="derechos" title="11. Tus derechos y cómo ejercerlos">
        <P>Como titular tienes derecho a conocer, actualizar, rectificar y suprimir tus datos, solicitar prueba de la autorización y revocarla.</P>
        <P>
          Consulta el detalle del procedimiento y los términos de respuesta en la página de{" "}
          <Link href="/proteccion-datos" className="underline hover:text-text">
            Protección de Datos
          </Link>
          . También puedes presentar quejas ante la <strong>Superintendencia de Industria y Comercio</strong>.
        </P>
      </Section>

      <Section id="vigencia" title="12. Vigencia y cambios">
        <P>
          Esta política rige desde su publicación. Podremos actualizarla; los cambios sustanciales se
          informarán por los canales de la plataforma.
        </P>
      </Section>
    </article>
  );
}
