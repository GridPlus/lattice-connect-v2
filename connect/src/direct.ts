import { appConfig } from "./config"
import { startService } from "./core"
import { useSigning } from "./services/useSigning"

startService(appConfig, [useSigning])
