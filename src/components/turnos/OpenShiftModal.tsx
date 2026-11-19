"use client";

import { UserRole } from "@prisma/client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams } from "next/navigation";

import NumPad from "@/components/ui/NumPad";
import ModalPortal from "@/components/ui/ModalPortal";
import PinModal from "@/components/ui/PinModal";

interface Employee {
  id: string;
  name: string;
  hasPin: boolean;
}

type EmployeeApiResponse = {
  id?: string;
  name?: string;
  hasPin?: boolean;
};

export interface ShiftAssignee {
  employeeId: string | null;
  employeeName: string;
}

interface OpenShiftModalProps {
  onConfirm: (payload: { openingAmount: number; assignee: ShiftAssignee; pin?: string }) => void | Promise<void>;
}

function normalizeEmployees(data: unknown): Employee[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map((entry: EmployeeApiResponse) => ({
      id: entry.id,
      name: entry.name,
      hasPin: Boolean(entry.hasPin),
    }))
    .filter((employee): employee is Employee => Boolean(employee.id && employee.name));
}

export default function OpenShiftModal({ onConfirm }: OpenShiftModalProps) {
  const { branchId } = useParams() as { branchId: string };
  const { data: session } = useSession();
  const userRole = session?.user?.role;
  const sessionEmployeeId = session?.user?.employeeId;
  const sessionName = session?.user?.name;

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>("owner");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const [showPinModal, setShowPinModal] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);

  useEffect(() => {
    fetch("/api/empleados?activeOnly=true", {
      headers: {
        "x-branch-id": branchId,
      },
    })
      .then((r) => r.json())
      .then((data) => {
        const active = normalizeEmployees(data);
        setEmployees(active);

        const firstWithPin = active.find((employee) => employee.hasPin);
        if (userRole === UserRole.EMPLOYEE && sessionEmployeeId) {
          const currentEmployee = active.find((employee) => employee.id === sessionEmployeeId);
          setSelectedEmployee(
            currentEmployee?.hasPin ? currentEmployee.id : firstWithPin?.id ?? "owner",
          );
        } else {
          setSelectedEmployee(firstWithPin?.id ?? "owner");
        }
      })
      .catch(() => {
        if (userRole === UserRole.EMPLOYEE && sessionEmployeeId) {
          setSelectedEmployee(sessionEmployeeId);
        } else {
          setSelectedEmployee("owner");
        }
      });
  }, [branchId, userRole, sessionEmployeeId]);

  const selectedEmp = employees.find((employee) => employee.id === selectedEmployee);
  const resolvedAssignee: ShiftAssignee =
    userRole === UserRole.EMPLOYEE
      ? {
          employeeId: sessionEmployeeId ?? null,
          employeeName: sessionName || selectedEmp?.name || "Empleado",
        }
      : selectedEmp
        ? { employeeId: selectedEmp.id, employeeName: selectedEmp.name }
        : { employeeId: null, employeeName: "Dueño" };

  const proceed = async (pin?: string) => {
    setLoading(true);
    await onConfirm({
      openingAmount: parseFloat(amount),
      assignee: resolvedAssignee,
      pin,
    });
    setLoading(false);
  };

  const handleConfirmClick = () => {
    if (!amount) return;

    if (resolvedAssignee.employeeId) {
      if (!selectedEmp?.hasPin) {
        alert("Este empleado debe tener un PIN configurado antes de abrir el turno.");
        return;
      }
      setPinError(null);
      setShowPinModal(true);
      return;
    }

    void proceed();
  };

  const handlePinConfirm = async (pin: string) => {
    if (!resolvedAssignee.employeeId) return;

    setPinLoading(true);
    setPinError(null);

    const res = await fetch("/api/empleados/verificar-pin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-branch-id": branchId,
      },
      body: JSON.stringify({ employeeId: resolvedAssignee.employeeId, pin }),
    });
    const data = await res.json();
    setPinLoading(false);

    if (data.ok) {
      setShowPinModal(false);
      void proceed(pin);
    } else {
      setPinError(data.error || "PIN incorrecto. Intenta de nuevo.");
    }
  };

  return (
    <>
      <ModalPortal>
        <div className="modal-overlay animate-fade-in">
          <div className="modal animate-slide-up">
          <div>
            <h2 style={{ fontSize: "20px", fontWeight: 700 }}>Abrir turno</h2>
            <p style={{ color: "var(--text-2)", fontSize: "14px", marginBottom: "16px" }}>
              Ingresa el dinero con el que abris la caja y quien queda a cargo.
            </p>
          </div>

          <div style={{ marginBottom: "12px" }}>
            <label
              style={{
                fontSize: "12px",
                color: "var(--text-3)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                display: "block",
                marginBottom: "6px",
              }}
            >
              Responsable del turno
            </label>

            {userRole === UserRole.EMPLOYEE ? (
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: "12px",
                  border: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  fontWeight: 700,
                  textAlign: "center",
                }}
              >
                {resolvedAssignee.employeeName}
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                <button
                  className={`btn btn-sm ${selectedEmployee === "owner" ? "btn-green" : "btn-ghost"}`}
                  onClick={() => setSelectedEmployee("owner")}
                >
                  Dueño
                </button>
                {employees.map((employee) => (
                  <button
                    key={employee.id}
                    className={`btn btn-sm ${selectedEmployee === employee.id ? "btn-green" : "btn-ghost"}`}
                    onClick={() => setSelectedEmployee(employee.id)}
                    disabled={!employee.hasPin}
                    style={{ opacity: employee.hasPin ? 1 : 0.5, cursor: employee.hasPin ? "pointer" : "not-allowed" }}
                  >
                    {employee.name}
                    <span style={{ marginLeft: "4px", fontSize: "11px", opacity: 0.7 }}>
                      {employee.hasPin ? "PIN" : "Configurar PIN"}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {employees.some((employee) => !employee.hasPin) && (
              <p style={{ color: "var(--text-3)", fontSize: "11px", marginTop: "8px" }}>
                Los empleados sin PIN no pueden quedar a cargo de un turno. Asignales uno desde Configuración → Empleados.
              </p>
            )}
          </div>

          <div
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-2)",
              borderRadius: "var(--radius)",
              padding: "16px",
              textAlign: "center",
              fontSize: "32px",
              fontWeight: 800,
              color: amount ? "var(--text)" : "var(--text-3)",
              minHeight: "56px",
            }}
          >
            {amount ? `$ ${amount}` : "Monto inicial"}
          </div>

          <NumPad value={amount} onChange={setAmount} />

          <button
            className="btn btn-green"
            style={{ marginTop: "10px" }}
            onClick={handleConfirmClick}
            disabled={!amount || loading}
          >
            {loading ? "Abriendo..." : selectedEmp?.hasPin ? "Abrir caja con PIN" : "Abrir caja"}
          </button>
          </div>
        </div>
      </ModalPortal>

      {showPinModal && (
        <PinModal
          title={`PIN de ${resolvedAssignee.employeeName}`}
          subtitle="Ingresa el PIN para confirmar"
          onConfirm={handlePinConfirm}
          onCancel={() => setShowPinModal(false)}
          loading={pinLoading}
          error={pinError}
        />
      )}
    </>
  );
}
