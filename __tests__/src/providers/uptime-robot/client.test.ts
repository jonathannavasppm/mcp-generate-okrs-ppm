import { describe, expect, it } from "vitest"
import { normalizeMonitorData } from "../../../../src/providers/uptime-robot/client.js"
import { publicMonitorResponseSchema } from "../../../../src/providers/uptime-robot/types.js"

const config = {
  enabled: true,
  companyId: "72wbnZjNpk",
  projectId: "801201665",
}

const response = publicMonitorResponseSchema.parse({
  status: "ok",
  title: "Empresa",
  timezone: "-05:00",
  monitor: {
    monitorId: 801201665,
    name: "Web",
    "30dRatio": { ratio: "98.000" },
    dailyRatios: [
      { date: "2026-09-01", ratio: "100.000" },
      { date: "2026-09-02", ratio: "99.000" },
    ],
    logs: [
      {
        label: "up",
        dateGMTISO: "2026-09-02T02:00:00+00:00",
        time: 1_788_315_200,
        timezone: "-05:00",
        reason: { code: "200", detail: { short: "Recovered" } },
      },
      {
        label: "down",
        dateGMTISO: "2026-09-02T01:00:00+00:00",
        time: 1_788_311_600,
        timezone: "-05:00",
        reason: { code: "500", detail: { short: "Server error" } },
      },
    ],
  },
})

describe("normalizeMonitorData", () => {
  it("calculates calendar-month availability and incidents", () => {
    const data = normalizeMonitorData(
      config,
      response,
      new Date("2026-09-29T12:00:00Z")
    )

    expect(data.dayCount).toBe(30)
    expect(data.totalHours).toBe(720)
    expect(data.availability).toBeCloseTo(99.8611)
    expect(data.downtimeHours).toBe(1)
    expect(data.incidents).toHaveLength(1)
    expect(data.incidents[0].durationHours).toBe(1)
    expect(data.incidents[0].startedAt.getUTCHours()).toBe(20)
    expect(data.incidents[0].endedAt?.getUTCHours()).toBe(21)
    expect(data.incidents[0].cause).toBe("500: Server error")
  })

  it("rejects months absent from the public response", () => {
    expect(() =>
      normalizeMonitorData(
        config,
        response,
        new Date("2026-06-15T12:00:00Z")
      )
    ).toThrow("no devolvió datos")
  })
})
