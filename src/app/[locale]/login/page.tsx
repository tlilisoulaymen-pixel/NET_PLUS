"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { frappe } from "@/lib/frappe/client";
import { User, Lock, ArrowRight, Loader2 } from "lucide-react";
import Image from "next/image";

// Vertex shader source code
const vertexSmokeySource = `
  attribute vec4 a_position;
  void main() {
    gl_Position = a_position;
  }
`;

// Fragment shader source code for the smokey background effect
const fragmentSmokeySource = `
precision mediump float;

uniform vec2 iResolution;
uniform float iTime;
uniform vec2 iMouse;
uniform vec3 u_color;

void mainImage(out vec4 fragColor, in vec2 fragCoord){
    vec2 uv = fragCoord / iResolution;
    vec2 centeredUV = (2.0 * fragCoord - iResolution.xy) / min(iResolution.x, iResolution.y);

    float time = iTime * 0.5;

    // Normalize mouse input (0.0 - 1.0) and remap to -1.0 ~ 1.0
    vec2 mouse = iMouse / iResolution;
    vec2 rippleCenter = 2.0 * mouse - 1.0;

    vec2 distortion = centeredUV;
    // Apply distortion for a wavy, smokey effect
    for (float i = 1.0; i < 8.0; i++) {
        distortion.x += 0.5 / i * cos(i * 2.0 * distortion.y + time + rippleCenter.x * 3.1415);
        distortion.y += 0.5 / i * cos(i * 2.0 * distortion.x + time + rippleCenter.y * 3.1415);
    }

    // Create a glowing wave pattern
    float wave = abs(sin(distortion.x + distortion.y + time));
    float glow = smoothstep(0.9, 0.2, wave);

    fragColor = vec4(u_color * glow, 1.0);
}

void main() {
    mainImage(gl_FragColor, gl_FragCoord.xy);
}
`;

type BlurSize = "none" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";

interface SmokeyBackgroundProps {
  backdropBlurAmount?: string;
  color?: string;
  className?: string;
}

const blurClassMap: Record<BlurSize, string> = {
  none: "backdrop-blur-none",
  sm: "backdrop-blur-sm",
  md: "backdrop-blur-md",
  lg: "backdrop-blur-lg",
  xl: "backdrop-blur-xl",
  "2xl": "backdrop-blur-2xl",
  "3xl": "backdrop-blur-3xl",
};

function SmokeyBackground({
  backdropBlurAmount = "sm",
  color = "#1E40AF",
  className = "",
}: SmokeyBackgroundProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Use refs instead of state — no re-renders on mouse move
  const mouseRef   = useRef({ x: 0, y: 0 });
  const hoverRef   = useRef(false);

  const hexToRgb = (hex: string): [number, number, number] => {
    const r = parseInt(hex.substring(1, 3), 16) / 255;
    const g = parseInt(hex.substring(3, 5), 16) / 255;
    const b = parseInt(hex.substring(5, 7), 16) / 255;
    return [r, g, b];
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl");
    if (!gl) return; // WebGL not supported — silently skip, CSS fallback shows

    const compileShader = (type: number, source: string): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertexShader   = compileShader(gl.VERTEX_SHADER,   vertexSmokeySource);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSmokeySource);
    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;

    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);

    const positionLocation   = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const iResolutionLocation = gl.getUniformLocation(program, "iResolution");
    const iTimeLocation       = gl.getUniformLocation(program, "iTime");
    const iMouseLocation      = gl.getUniformLocation(program, "iMouse");
    const uColorLocation      = gl.getUniformLocation(program, "u_color");

    const startTime = Date.now();
    const [r, g, b] = hexToRgb(color);
    gl.uniform3f(uColorLocation, r, g, b);

    // Track last canvas size — only reset when dimensions change (avoid GPU flush every frame)
    let lastW = 0, lastH = 0;
    let rafId = 0;

    const render = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w !== lastW || h !== lastH) {
        canvas.width  = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
        lastW = w; lastH = h;
      }

      const t = (Date.now() - startTime) / 1000;
      gl.uniform2f(iResolutionLocation, lastW, lastH);
      gl.uniform1f(iTimeLocation, t);
      gl.uniform2f(
        iMouseLocation,
        hoverRef.current ? mouseRef.current.x : lastW / 2,
        hoverRef.current ? lastH - mouseRef.current.y : lastH / 2
      );
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      rafId = requestAnimationFrame(render);
    };

    // Mouse events update refs — zero re-renders
    const onMove  = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onEnter = () => { hoverRef.current = true; };
    const onLeave = () => { hoverRef.current = false; };

    canvas.addEventListener("mousemove",  onMove);
    canvas.addEventListener("mouseenter", onEnter);
    canvas.addEventListener("mouseleave", onLeave);

    rafId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafId);            // ← clean stop, no zombie frames
      canvas.removeEventListener("mousemove",  onMove);
      canvas.removeEventListener("mouseenter", onEnter);
      canvas.removeEventListener("mouseleave", onLeave);
      gl.deleteProgram(program);
    };
  }, [color]); // ← only re-init if color prop changes

  const finalBlurClass = blurClassMap[backdropBlurAmount as BlurSize] || blurClassMap["sm"];

  return (
    <div className={`absolute inset-0 w-full h-full overflow-hidden ${className}`}>
      <canvas ref={canvasRef} className="w-full h-full" />
      <div className={`absolute inset-0 ${finalBlurClass}`}></div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [usr, setUsr] = useState("");
  const [pwd, setPwd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await frappe.login(usr, pwd);
      
      const homePage = res.home_page || "/desk";
      
      // If it's the ERP desk, route internally in Next.js
      if (homePage === "/desk" || homePage.startsWith("/desk/") || homePage === "app" || homePage === "/app") {
        router.replace("/desk");
      } else {
        // PWA routes (/netplus-pwa, /netplus-client, /netplus-supervision, /me, /app)
        // are served by the Frappe backend, not by Vercel — redirect to the backend URL.
        const backendUrl = process.env.NEXT_PUBLIC_FRAPPE_URL || "http://localhost:8080";
        const path = homePage.startsWith("/") ? homePage : `/${homePage}`;
        window.location.href = `${backendUrl}${path}`;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative w-screen h-screen bg-gray-900">
      <SmokeyBackground className="absolute inset-0" color="#0369a1" /> {/* Sky/Brand color */}
      <div className="relative z-10 flex items-center justify-center w-full h-full p-4">
        
        <div className="w-full max-w-sm p-8 space-y-6 bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 shadow-2xl">
          <div className="text-center flex flex-col items-center">
            {/* Logo */}
            <div className="relative h-16 w-32 mb-4">
              <Image 
                src="/logo-net-plus.png" 
                alt="Net Plus" 
                fill 
                className="object-contain" 
                priority 
              />
            </div>
            <h2 className="text-3xl font-bold text-white">Welcome Back</h2>
            <p className="mt-2 text-sm text-gray-300">Sign in to continue</p>
          </div>
          
          <form className="space-y-8" onSubmit={submit}>
            {/* Email Input with Animated Label */}
            <div className="relative z-0">
              <input
                type="text"
                id="floating_email"
                value={usr}
                onChange={(e) => setUsr(e.target.value)}
                autoComplete="username"
                className="block py-2.5 px-0 w-full text-sm text-white bg-transparent border-0 border-b-2 border-gray-300 appearance-none focus:outline-none focus:ring-0 focus:border-blue-500 peer"
                placeholder=" " 
                required
              />
              <label
                htmlFor="floating_email"
                className="absolute text-sm text-gray-300 duration-300 transform -translate-y-6 scale-75 top-3 -z-10 origin-[0] peer-focus:left-0 peer-focus:text-blue-400 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-6"
              >
                <User className="inline-block mr-2 -mt-1" size={16} />
                Email Address or Username
              </label>
            </div>
            
            {/* Password Input with Animated Label */}
            <div className="relative z-0">
              <input
                type="password"
                id="floating_password"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                autoComplete="current-password"
                className="block py-2.5 px-0 w-full text-sm text-white bg-transparent border-0 border-b-2 border-gray-300 appearance-none focus:outline-none focus:ring-0 focus:border-blue-500 peer"
                placeholder=" "
                required
              />
              <label
                htmlFor="floating_password"
                className="absolute text-sm text-gray-300 duration-300 transform -translate-y-6 scale-75 top-3 -z-10 origin-[0] peer-focus:left-0 peer-focus:text-blue-400 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-6"
              >
                <Lock className="inline-block mr-2 -mt-1" size={16} />
                Password
              </label>
            </div>

            {error && (
              <div className="text-sm text-red-400 bg-red-400/10 p-2 rounded border border-red-400/20">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between">
              <a href="#" className="text-xs text-gray-300 hover:text-white transition">Forgot Password?</a>
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className="group w-full flex items-center justify-center py-3 px-4 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500 transition-all duration-300 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="ml-2 h-5 w-5 transform group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

           <p className="mt-4 text-center text-xs text-gray-400">
            Powered by Frappe / ERPNext API
          </p>
        </div>
      </div>
    </main>
  );
}
