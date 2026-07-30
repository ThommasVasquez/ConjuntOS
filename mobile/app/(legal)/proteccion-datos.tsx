import { Stack, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Text, View } from 'react-native';

import { LegalShell } from '@/components/legal/LegalShell';
import { Anchor, LI, Note, P, Section, Strong, UL } from '@/components/legal/Prose';

/**
 * Web `metadata.title` (src/app/(legal)/proteccion-datos/page.tsx:6). The
 * group's Stack hides the header, so this is invisible on native, but it is the
 * closest equivalent to the document title and it IS applied on the static web
 * export. Declared at module scope so the object identity is stable across
 * renders (Stack.Screen re-runs `navigation.setOptions` whenever `options`
 * changes).
 */
const SCREEN_OPTIONS = {
  title: 'Protección de Datos | ConjuntOS® 🏘️',
} as const;

/** Web: `<a href="https://www.sic.gov.co" target="_blank" rel="noopener noreferrer">`. */
const SIC_URL = 'https://www.sic.gov.co';

/**
 * Protección de Datos Personales.
 *
 * Mobile port of web `src/app/(legal)/proteccion-datos/page.tsx` (rendered
 * inside `src/app/(legal)/layout.tsx`, ported as `LegalShell`). Static legal
 * copy — no API calls, no auth or role gate, no realtime. Every string is
 * verbatim from web, including the `[bracketed]` placeholder of the base
 * template.
 *
 * Web's `metadata.title` is applied through `Stack.Screen` (see SCREEN_OPTIONS);
 * `metadata.description` has no RN equivalent.
 */
export default function ProteccionDatos() {
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
          Protección de Datos Personales
        </Text>
        <Text className="mt-3 text-sm text-text-muted">
          Tus derechos como titular (Habeas Data) y cómo ejercerlos.
        </Text>

        <Section id="derechos" title="Tus derechos">
          <P>
            Conforme a la Ley 1581 de 2012, como titular de tus datos personales tienes derecho a:
          </P>
          <UL>
            <LI>
              <Strong>Conocer, actualizar y rectificar</Strong> tus datos frente al responsable o
              encargado.
            </LI>
            <LI>
              <Strong>Solicitar prueba</Strong> de la autorización otorgada, salvo cuando la ley no
              la exija.
            </LI>
            <LI>
              <Strong>Ser informado</Strong> sobre el uso que se ha dado a tus datos.
            </LI>
            <LI>
              <Strong>Presentar quejas</Strong> ante la Superintendencia de Industria y Comercio
              (SIC) por infracciones.
            </LI>
            <LI>
              <Strong>Revocar la autorización</Strong> y/o{' '}
              <Strong>solicitar la supresión</Strong> del dato cuando no exista un deber legal o
              contractual de conservarlo.
            </LI>
            <LI>
              <Strong>Acceder gratuitamente</Strong> a tus datos personales objeto de tratamiento.
            </LI>
          </UL>
        </Section>

        <Section id="ejercer" title="Cómo ejercer tus derechos">
          <P>
            Envía tu solicitud (consulta o reclamo) al correo{' '}
            <Strong>[protecciondedatos@enconjunto.co]</Strong>, indicando tu nombre, documento,
            unidad y la petición concreta. Responderemos en los siguientes términos legales:
          </P>
          <UL>
            <LI>
              <Strong>Consultas:</Strong> se atienden en un máximo de{' '}
              <Strong>diez (10) días hábiles</Strong>. Si no es posible, te informaremos los motivos
              y la fecha en que se atenderá (no mayor a cinco días hábiles adicionales).
            </LI>
            <LI>
              <Strong>Reclamos:</Strong> se resuelven en un máximo de{' '}
              <Strong>quince (15) días hábiles</Strong> desde el día siguiente a su recepción,
              prorrogables por ocho días hábiles más, informándote las razones.
            </LI>
          </UL>
        </Section>

        <Section id="sic" title="Reclamo ante la autoridad">
          <P>
            Antes de acudir a la SIC, el titular debe agotar el trámite de consulta o reclamo ante
            nosotros. Si no obtienes respuesta satisfactoria, puedes presentar tu queja ante la{' '}
            <Strong>Superintendencia de Industria y Comercio</Strong> (
            <Anchor
              onPress={() => {
                // Web opens the SIC site in a new tab; native hands it to the browser.
                Linking.openURL(SIC_URL).catch(() => {});
              }}
            >
              www.sic.gov.co
            </Anchor>
            ), autoridad de control en Colombia.
          </P>
        </Section>

        <Section id="mas" title="Más información">
          <P>
            El detalle de las finalidades, los datos que tratamos, las cookies y la transferencia
            internacional a servidores en Estados Unidos está en nuestra{' '}
            <Anchor onPress={() => router.push('/(legal)/privacidad')}>
              Política de Privacidad y Tratamiento de Datos
            </Anchor>
            .
          </P>
          <Note>
            Los datos de contacto del responsable son provisionales y deben completarse con la
            información legal definitiva antes de la publicación oficial.
          </Note>
        </Section>
      </View>
    </LegalShell>
  );
}
