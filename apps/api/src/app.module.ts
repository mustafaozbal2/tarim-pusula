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
import { AnnouncementsController, FieldCalendarController } from './controllers.g4';
import { Places } from './places';
import { DataService } from './data.service';
import type { Db } from './db/db';
import { HealthController } from './health.controller';
import {
  FakePushClient,
  InMemoryQueue,
  type NotificationQueue,
  type PushClient,
} from '@tarim/workers';
import { NotifyService } from './weather/notify';
import { FakeWeatherProvider, type WeatherProvider } from './weather/openmeteo';
import { CLOCK, NOTIFY_QUEUE, PUSH, WEATHER } from './weather/tokens';
import { JobsController, PushTokenController, TodayController } from './weather/weather.controller';

export interface AppOptions {
  db: Db;
  sms: SmsProvider;
  auth?: Partial<AuthConfig>;
  places?: Places;
  /** Verilmezse ağa çıkmayan sahte sağlayıcı (testler ve anahtarsız geliştirme). */
  weather?: WeatherProvider;
  queue?: NotificationQueue;
  push?: PushClient;
  now?: () => Date;
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
        TodayController,
        PushTokenController,
        JobsController,
        FieldCalendarController,
        AnnouncementsController,
      ],
      providers: [
        { provide: DB, useValue: opts.db },
        { provide: SMS, useValue: opts.sms },
        { provide: AUTH_CONFIG, useValue: { ...defaultAuthConfig(), ...opts.auth } },
        { provide: PLACES, useFactory: () => opts.places ?? Places.load() },
        { provide: WEATHER, useValue: opts.weather ?? new FakeWeatherProvider() },
        { provide: NOTIFY_QUEUE, useValue: opts.queue ?? new InMemoryQueue() },
        { provide: PUSH, useValue: opts.push ?? new FakePushClient() },
        { provide: CLOCK, useValue: opts.now ?? (() => new Date()) },
        NotifyService,
        AuthService,
        DataService,
        { provide: APP_GUARD, useClass: AccessGuard },
      ],
    };
  }
}
