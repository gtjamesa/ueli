import { ApplicationRepository } from "./application-repository";
import { Application } from "./application";
import { ApplicationSearchOptions } from "../../../common/config/application-search-options";
import { basename, extname } from "path";
import { Icon } from "../../../common/icon/icon";
import { ApplicationIconService } from "./application-icon-service";
import { getApplicationIconFilePath } from "./application-icon-helpers";
import { IconType } from "../../../common/icon/icon-type";
import { Logger } from "../../../common/logger/logger";
import { OperatingSystem, OperatingSystemVersion } from "../../../common/operating-system";
import { getCurrentOperatingSystem } from "../../../common/helpers/operating-system-helpers";
import { platform } from "os";
import { FileHelpers } from "../../../common/helpers/file-helpers";
import { parse } from "ini";

export class ProductionApplicationRepository implements ApplicationRepository {
    private applications: Application[];
    private readonly defaultAppIcon: Icon;
    private readonly appIconService: ApplicationIconService;
    private readonly searchApplications: (
        options: ApplicationSearchOptions,
        logger: Logger,
        operatingSystemVersion: OperatingSystemVersion,
    ) => Promise<string[]>;
    private config: ApplicationSearchOptions;
    private readonly logger: Logger;
    private readonly operatingSystemVersion: OperatingSystemVersion;

    constructor(
        config: ApplicationSearchOptions,
        defaultAppIcon: Icon,
        appIconService: ApplicationIconService,
        searchApplications: (
            options: ApplicationSearchOptions,
            logger: Logger,
            operatingSystemVersion: OperatingSystemVersion,
        ) => Promise<string[]>,
        logger: Logger,
        operatingSystemVersion: OperatingSystemVersion,
    ) {
        this.config = config;
        this.defaultAppIcon = defaultAppIcon;
        (this.appIconService = appIconService), (this.searchApplications = searchApplications);
        this.logger = logger;
        this.operatingSystemVersion = operatingSystemVersion;
        this.applications = [];
    }

    public getAll(): Promise<Application[]> {
        return Promise.resolve(this.applications);
    }

    public refreshIndex(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.searchApplications(this.config, this.logger, this.operatingSystemVersion)
                .then((filePaths) => {
                    Promise.all(filePaths.map((filePath) => this.createApplicationFromFilePath(filePath)))
                    .then((applications) => {
                        if (this.config.useNativeIcons) {
                            this.appIconService
                                .generateAppIcons(applications)
                                .then(() => {
                                    this.onSuccessfullyGeneratedAppIcons(applications);
                                    this.applications = applications;
                                    resolve();
                                })
                                .catch((err) => reject(err));
                        } else {
                            this.applications = applications;
                            resolve();
                        }
                    })
                    .catch((err) => reject(err));
                })
                .catch((err) => reject(err));
        });
    }

    public clearCache(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.appIconService
                .clearCache()
                .then(() => resolve())
                .catch((err) => reject(err));
        });
    }

    public updateConfig(updatedConfig: ApplicationSearchOptions): Promise<void> {
        return new Promise((resolve) => {
            this.config = updatedConfig;
            resolve();
        });
    }

    private createApplicationFromFilePath(filePath: string): Promise<Application> {
        return new Promise((resolve, reject) => {
            const currentOperatingSystem = getCurrentOperatingSystem(platform());
            if (currentOperatingSystem === OperatingSystem.Linux) {
                FileHelpers.readFile(filePath).then((data) => {
                    const config = parse(data);
                    const appName = config["Desktop Entry"]["Name"];
                    resolve({
                        filePath,
                        icon: this.defaultAppIcon,
                        name: appName,
                    });
                });
            } else {
                resolve({
                    filePath,
                    icon: this.defaultAppIcon,
                    name: basename(filePath).replace(extname(filePath), ""),
                });
            }
        });
    }

    private onSuccessfullyGeneratedAppIcons(applications: Application[]) {
        applications.forEach(
            (application) =>
                (application.icon = {
                    parameter: getApplicationIconFilePath(application.filePath),
                    type: IconType.URL,
                }),
        );
    }
}
