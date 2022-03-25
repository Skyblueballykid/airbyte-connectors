import axios, {AxiosError, AxiosInstance} from 'axios';
import {VError} from 'verror';

import {
  CustomerIOCampaign,
  CustomerIOCampaignAction,
  CustomerIOListCampaignActionsResponse,
  CustomerIOListCampaignsResponse,
  CustomerIOListNewsletterResponse,
  CustomerIONewsletter,
} from './typings';

const CUSTOMER_IO_BETA_API_URL = 'https://beta-api.customer.io/v1/api';
const REG_EXP_ISO_8601_FULL =
  /[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}/;

export interface CustomerIOConfig {
  app_api_key: string;
  readonly start_date: string;
}

export class CustomerIO {
  private constructor(
    readonly axios: AxiosInstance,
    readonly startDate: Date
  ) {}

  static instance(
    config: CustomerIOConfig,
    axiosInstance?: AxiosInstance
  ): CustomerIO {
    if (!config.start_date) {
      throw new VError('start_date is null or empty');
    }
    if (!REG_EXP_ISO_8601_FULL.test(config.start_date)) {
      throw new VError('start_date is invalid: %s', config.start_date);
    }
    return new CustomerIO(
      axiosInstance ??
        axios.create({
          baseURL: CUSTOMER_IO_BETA_API_URL,
          timeout: 30000,
          responseType: 'json',
          headers: {Authorization: `Bearer ${config.app_api_key}`},
        }),
      new Date(config.start_date)
    );
  }

  async checkConnection(): Promise<void> {
    try {
      await this.axios.get('/campaigns');
    } catch (error) {
      if (
        (error as AxiosError).response &&
        (error as AxiosError).response.status === 401
      ) {
        throw new VError(
          'Customer.io authorization failed. Try changing your app api token'
        );
      }

      throw new VError(
        `Customer.io api request failed: ${(error as Error).message}`
      );
    }
  }

  async *getCampaigns(
    updated = 0
  ): AsyncGenerator<CustomerIOCampaign, any, any> {
    const updatedMax = Math.max(updated ?? 0, this.startDate.getTime());
    const response = await this.axios.get<CustomerIOListCampaignsResponse>(
      '/campaigns'
    );

    for (const campaign of response.data.campaigns) {
      if (campaign.updated >= updatedMax) {
        yield campaign;
      }
    }
  }

  async *getCampaignActions(
    updated = 0
  ): AsyncGenerator<CustomerIOCampaignAction, any, any> {
    const updatedMax = Math.max(updated ?? 0, this.startDate.getTime());
    const campaignsResponse =
      await this.axios.get<CustomerIOListCampaignsResponse>('/campaigns');

    for (const campaign of campaignsResponse.data.campaigns) {
      if (Array.isArray(campaign?.actions) && campaign.actions.length > 0) {
        let nextKey: string | undefined;

        do {
          const pageResponse =
            await this.axios.get<CustomerIOListCampaignActionsResponse>(
              `/campaigns/${campaign.id}/actions`,
              {params: {start: nextKey}}
            );

          nextKey = pageResponse.data.next || undefined;

          for (const action of pageResponse.data.actions ?? []) {
            if (action.updated >= updatedMax) {
              yield action;
            }
          }
        } while (nextKey);
      }
    }
  }

  async *getNewsletters(
    updated = 0
  ): AsyncGenerator<CustomerIONewsletter, any, any> {
    const updatedMax = Math.max(updated ?? 0, this.startDate.getTime());
    const response = await this.axios.get<CustomerIOListNewsletterResponse>(
      '/newsletters'
    );

    for (const newsletter of response.data.newsletters) {
      if (newsletter.updated >= updatedMax) {
        yield newsletter;
      }
    }
  }
}
