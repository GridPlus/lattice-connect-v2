import cluster, { Worker } from "cluster"

const log = {
  info: console.log
}

/**
 * Spawns as many workers as there are CPUs on the host system, 
 * unless limited by `limitTo`. 
 *
 * At a minimum, 1 worker is guaranteed to spawn.
 */
export function spawn({ upTo, worker }: { upTo?: string | number | undefined, worker: (worker: Worker) => void }) {
  if (cluster.isMaster) {
    // Spawn Processes
    const upperBound = require('os').cpus().length
    const lowerBound = upTo ?? upperBound
    const numWorkers = Math.max(1, Math.min(lowerBound, upperBound))
    for (let i = 0; i < numWorkers; i++) {
      cluster.fork()
    }

    cluster.on('online', function (worker) {
      log.info('Worker ' + worker.id + ' is online')
    })

    cluster.on('exit', function (worker, code, signal) {
      log.info(`Worker ${worker.id} died with code: ${code}, and signal: ${signal}`)
      if (code != 0 && code != 1) {
        log.info('Starting a new worker')
        cluster.fork()
      } else {
        log.info(`Worker ${worker.id} is not being replaced. Exiting.`)
      }
    })
  }
  else {
    worker(cluster.worker!)
  }
}