import { Stack, useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { LegalShell } from '@/components/legal/LegalShell';
import { Anchor, Code, LI, Note, P, Section, Strong, UL } from '@/components/legal/Prose';

/**
 * Web `metadata.title` (src/app/(legal)/privacidad/page.tsx:6). The group's
 * Stack hides the header, so this is invisible on native, but it is the closest
 * equivalent to the document title and it IS applied on the static web export.
 * Declared at module scope so the object identity is stable across renders
 * (Stack.Screen re-runs `navigation.setOptions` whenever `options` changes).
 */
const SCREEN_OPTIONS = {
  title: 'Política de Privacidad y Tratamiento de Datos | ConjuntOS® 🏘️',
} as const;

/**
 * Política de Privacidad y Tratamiento de Datos Personales.
 *
 * Mobile port of web `src/app/(legal)/privacidad/page.tsx` (rendered inside
 * `src/app/(legal)/layout.tsx`). Static legal copy — no API calls, no auth or
 * role gate, no realtime. Every string is verbatim from web, including the
 * `[bracketed]` placeholders of the base template.
 *
 * Web's `metadata.title` is applied through `Stack.Screen` (see SCREEN_OPTIONS);
 * `metadata.description` has no RN equivalent.
 */
export default function Privacidad() {
  const router = useRouter();

  return (
    <LegalShell>
      {/* Renders nothing; only applies the screen options above. */}
      <Stack.Screen options={SCREEN_OPTIONS} />
      <View>
        <Text className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">
          Legal
        </Text>
        {/* Web `<h1>`; `accessibilityRole="header"` keeps the heading semantics. */}
        <Text accessibilityRole="header" className="font-display text-3xl font-bold text-text">
          Política de Privacidad y Tratamiento de Datos Personales
        </Text>
        <Text className="mt-3 text-sm text-text-muted">
          Última actualización: 6 de julio de 2026 · Versión 1.0
        </Text>

        <View className="mt-8">
          <Note>
            <Strong>Plantilla base.</Strong> Este documento debe completarse con los datos legales
            definitivos del responsable (razón social, NIT, domicilio y correo) y ser revisado por un
            abogado antes de su publicación oficial. Los campos entre corchetes <Code>[ ]</Code> son
            marcadores de posición.
          </Note>
        </View>

        <Section id="responsable" title="1. Responsable del tratamiento">
          <P>
            El responsable del tratamiento de los datos personales recolectados a través de la
            plataforma ConjuntOS® 🏘️ es <Strong>ENERGYSOFTmedia S.A.S.</Strong> (o la copropiedad
            administradora que corresponda), identificada con NIT <Strong>[NIT]</Strong>, con
            domicilio en <Strong>[ciudad, Colombia]</Strong>.
          </P>
          <UL>
            <LI>
              Correo de contacto para protección de datos:{' '}
              <Strong>[protecciondedatos@enconjunto.co]</Strong>
            </LI>
            <LI>
              Teléfono: <Strong>[teléfono]</Strong>
            </LI>
            <LI>
              Dirección física: <Strong>[dirección]</Strong>
            </LI>
          </UL>
        </Section>

        <Section id="marco" title="2. Marco legal">
          <P>
            Esta política se rige por la Constitución Política de Colombia (art. 15), la Ley
            Estatutaria 1581 de 2012, el Decreto 1074 de 2015 (que compila el Decreto 1377 de 2013) y
            las circulares e instrucciones de la Superintendencia de Industria y Comercio (SIC),
            autoridad colombiana de protección de datos.
          </P>
        </Section>

        <Section id="datos" title="3. Datos personales que tratamos">
          <P>
            Según el rol de cada persona (residente, administración, vigilancia, huésped, etc.),
            podemos tratar:
          </P>
          <UL>
            <LI>
              <Strong>Identificación y contacto:</Strong> nombre, documento, correo, teléfono, torre y
              apartamento.
            </LI>
            <LI>
              <Strong>Unidad y convivencia:</Strong> estado de cuenta, mascotas y vehículos
              registrados, paquetería y correspondencia.
            </LI>
            <LI>
              <Strong>Acceso y seguridad:</Strong> registro de visitas, pases temporales, imágenes de
              videovigilancia (CCTV), rondas y novedades.
            </LI>
            <LI>
              <Strong>Financieros:</Strong> pagos de administración y datos necesarios para
              conciliarlos con la pasarela (p. ej. Nequi).
            </LI>
            <LI>
              <Strong>Ubicación:</Strong> ubicación aproximada asociada a una alerta de pánico (SOS),
              únicamente cuando el titular la activa.
            </LI>
            <LI>
              <Strong>Técnicos:</Strong> datos de sesión, dispositivo y cookies (ver sección 8).
            </LI>
          </UL>
        </Section>

        <Section id="sensibles" title="4. Datos sensibles y de menores de edad">
          <P>
            Algunos datos pueden ser sensibles (por ejemplo, imágenes que revelen características de
            las personas) o corresponder a niños, niñas y adolescentes. Estos reciben protección
            reforzada: su tratamiento es facultativo, requiere autorización explícita y se realiza
            siempre en interés superior del menor y con finalidades legítimas. La videovigilancia se
            limita a fines de seguridad, con zonas señalizadas y plazos de conservación acotados.
          </P>
        </Section>

        <Section id="finalidades" title="5. Finalidades del tratamiento">
          <UL>
            <LI>Prestar y administrar los servicios de la plataforma para la copropiedad.</LI>
            <LI>Gestionar el control de acceso, la seguridad y la portería del conjunto.</LI>
            <LI>Procesar pagos, cartera, multas y comunicaciones administrativas.</LI>
            <LI>Facilitar asambleas, votaciones, encuestas y trámites (PQRS).</LI>
            <LI>Enviar notificaciones operativas y de seguridad.</LI>
            <LI>Cumplir obligaciones legales y atender a las autoridades competentes.</LI>
          </UL>
        </Section>

        <Section id="autorizacion" title="6. Autorización del titular">
          <P>
            Salvo las excepciones legales, el tratamiento requiere autorización previa, expresa e
            informada del titular, que se obtiene al registrarse o aceptar esta política. El titular
            puede revocar su autorización en cualquier momento, sin efectos retroactivos, por los
            canales de la sección 11.
          </P>
        </Section>

        <Section id="cookies" title="7. Cookies y tecnologías similares">
          <P>
            Usamos cookies y almacenamiento local para el funcionamiento, la seguridad y la mejora de
            la plataforma. Al ingresar verás un aviso para <Strong>aceptar</Strong> o{' '}
            <Strong>rechazar</Strong>
            las cookies no esenciales; tu elección se guarda en tu navegador.
          </P>
          <UL>
            <LI>
              <Strong>Necesarias:</Strong> sesión, autenticación y seguridad. No pueden desactivarse.
            </LI>
            <LI>
              <Strong>Funcionales:</Strong> recuerdan preferencias como el tema claro/oscuro.
            </LI>
            <LI>
              <Strong>Analíticas:</Strong> nos ayudan a entender el uso de la plataforma (solo si las
              aceptas).
            </LI>
          </UL>
          <P>
            Puedes eliminar o bloquear cookies desde la configuración de tu navegador; algunas
            funciones podrían verse afectadas.
          </P>
        </Section>

        <Section id="transferencia" title="8. Transferencia y transmisión internacional de datos">
          <P>
            La infraestructura de ConjuntOS® 🏘️ está alojada en servidores ubicados en los{' '}
            <Strong>Estados Unidos de América</Strong>. La legislación colombiana{' '}
            <Strong>no exige</Strong> que los datos se almacenen en Colombia; regula su transferencia
            internacional (art. 26 de la Ley 1581 de 2012).
          </P>
          <P>
            Estados Unidos figura en la lista de países con{' '}
            <Strong>nivel adecuado de protección</Strong> reconocidos por la SIC (Circular Externa 005
            de 2017 y concordantes), por lo que la transferencia está permitida sin autorización
            especial de la SIC. Adicionalmente, con nuestros proveedores (encargados) en el exterior
            suscribimos <Strong>contratos de transmisión de datos</Strong> con cláusulas contractuales
            conforme a las Circulares Externas 002 y 003 de 2025, y aplicamos medidas de seguridad
            apropiadas.
          </P>
        </Section>

        <Section id="encargados" title="9. Encargados y terceros">
          <P>
            Compartimos datos con proveedores que actúan como encargados únicamente para las
            finalidades de esta política: proveedor de infraestructura/alojamiento, pasarela de pagos
            (p. ej. Nequi), servicios de notificaciones y de video para asambleas. No vendemos datos
            personales.
          </P>
        </Section>

        <Section id="conservacion" title="10. Conservación y seguridad">
          <P>
            Conservamos los datos mientras exista la relación con la copropiedad y por los plazos
            exigidos por la ley. Aplicamos medidas técnicas y organizativas razonables (cifrado,
            control de acceso y copias de seguridad) para prevenir el acceso, pérdida o alteración no
            autorizados.
          </P>
        </Section>

        <Section id="derechos" title="11. Tus derechos y cómo ejercerlos">
          <P>
            Como titular tienes derecho a conocer, actualizar, rectificar y suprimir tus datos,
            solicitar prueba de la autorización y revocarla.
          </P>
          <P>
            Consulta el detalle del procedimiento y los términos de respuesta en la página de{' '}
            <Anchor onPress={() => router.push('/(legal)/proteccion-datos')}>
              Protección de Datos
            </Anchor>
            . También puedes presentar quejas ante la{' '}
            <Strong>Superintendencia de Industria y Comercio</Strong>.
          </P>
        </Section>

        <Section id="vigencia" title="12. Vigencia y cambios">
          <P>
            Esta política rige desde su publicación. Podremos actualizarla; los cambios sustanciales
            se informarán por los canales de la plataforma.
          </P>
        </Section>
      </View>
    </LegalShell>
  );
}
