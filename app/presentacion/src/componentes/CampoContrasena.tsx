// SIGET-VÍA — CAPA DE PRESENTACIÓN
// Campo de contraseña con botón para mostrar u ocultar el texto.
import { useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export default function CampoContrasena(props: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <span className="campo-clave">
      <input {...props} type={visible ? 'text' : 'password'} />
      <button
        type="button"
        className="campo-clave-ojo"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        title={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        tabIndex={-1}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </span>
  );
}