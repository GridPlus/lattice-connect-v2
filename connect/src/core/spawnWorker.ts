import cluster, { Worker } from "cluster"
import os from "node:os"

/**
 * Spawns as many workers as there are CPUs on the host system,
 * unless limited by `upTo`.
 *
 * At a minimum, 1 worker is guaranteed to spawn.
 */
export function spawn({ upTo, worker }: { upTo?: string, worker: (worker: Worker) => void }) {
  if (cluster.isPrimary) {
    // Spawn Processes
    const upperBound = os.cpus().length
    const requested = Number(upTo)
    const lowerBound = Number.isFinite(requested) ? requested : upperBound
    const numWorkers = Math.max(1, Math.min(lowerBound, upperBound))
    for (let i = 0; i < numWorkers; i++) {
      cluster.fork()
    }

    // The smoke test waits for "is online" and counts "died".
    cluster.on('online', function (worker) {
      console.log('Worker ' + worker.id + ' is online')
    })

    cluster.on('exit', function (worker, code, signal) {
      console.log(`Worker ${worker.id} died with code: ${code}, and signal: ${signal}`)
      if (code != 0 && code != 1) {
        console.log('Starting a new worker')
        cluster.fork()
      } else {
        console.log(`Worker ${worker.id} is not being replaced. Exiting.`)
      }
    })
  }
  else {
    worker(cluster.worker!)
  }
}