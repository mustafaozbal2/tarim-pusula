import { Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessGuard } from './auth/access';
import {
  AUTH_CONFIG,
  AuthService,
  DB,
  SMS,
  defaultAuthConfig,
  type AuthConfig,
} from './auth/auth.service';
import type { SmsProvider } from './auth/sms';
import {
  AdminController,
  AuthController,
  DevicesController,
  FieldsController,
  MeController,
} from './controllers';
import { CropsController, NearbyController, PLACES, PlacesController } from './controllers.g2';
import { Places } from './places';
import { DataService } from './data.service';
import type { Db } from './db/db';
import { HealthController } from './health.controller';

export interface AppOptions {
  db: Db;
  sms: SmsProvider;
  auth?: Partial<AuthConfig>;
  places?: Places;
}

@Module({})
export class AppModule {
  static register(opts: AppOptions): DynamicModule {
    return {
      module: AppModule,
      controllers: [
        HealthController,
        AuthController,
        FieldsController,
        DevicesController,
        MeController,
        AdminController,
        PlacesController,
        CropsController,
        NearbyController,
      ],
      providers: [
        { provide: DB, useValue: opts.db },
        { provide: SMS, useValue: opts.sms },
        { provide: AUTH_CONFIG, useValue: { ...defaultAuthConfig(), ...opts.auth } },
        { provide: PLACES, useFactory: () => opts.places ?? Places.load() },
        AuthService,
        DataService,
        { provide: APP_GUARD, useClass: AccessGuard },
      ],
    };
  }
}
